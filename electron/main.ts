import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, nativeImage, protocol, shell } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { BlockChangedEvent, CalendarChangedEvent, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent } from '../shared/types'
import { createAppContext, type AppContext } from './appContext'
import { registerIpcHandlers } from './ipc/register'

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const APP_NAME = '长布'
const DEFAULT_ZOOM_FACTOR = 1.1
const APP_IDLE_TIMEOUT_MS = 15_000
const preloadPath = join(__dirname, 'preload.cjs')
const ATTACHMENT_PROTOCOL = 'changbu-attachment'
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let appContext: AppContext | null = null
let unregisterHandlers: (() => void) | null = null
let isQuitting = false
let quitTask: Promise<void> | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: ATTACHMENT_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function sendEvent(
  channel: string,
  payload: BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | CalendarChangedEvent | DocGenerationChunk | { waiting: boolean },
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function sendQuitState(waiting: boolean): void {
  sendEvent(IPC_CHANNELS.events.quitStateChanged, { waiting })
}

function getMimeTypeFromPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.bmp':
      return 'image/bmp'
    case '.ico':
      return 'image/x-icon'
    case '.avif':
      return 'image/avif'
    case '.heic':
      return 'image/heic'
    case '.heif':
      return 'image/heif'
    default:
      return 'application/octet-stream'
  }
}

function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const relativePath = relative(directory, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

async function registerAttachmentProtocol(dataDirectory: string): Promise<void> {
  const attachmentsDirectory = resolve(join(dataDirectory, 'attachments'))

  if (protocol.isProtocolHandled(ATTACHMENT_PROTOCOL)) {
    await protocol.unhandle(ATTACHMENT_PROTOCOL)
  }

  await protocol.handle(ATTACHMENT_PROTOCOL, async (request) => {
    try {
      const requestUrl = new URL(request.url)
      const sourceUrl = requestUrl.searchParams.get('url')

      if (!sourceUrl) {
        return new Response('Missing attachment url.', { status: 400 })
      }

      const filePath = resolve(fileURLToPath(sourceUrl))

      if (!isPathWithinDirectory(filePath, attachmentsDirectory)) {
        return new Response('Forbidden.', { status: 403 })
      }

      const data = await readFile(filePath)

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': getMimeTypeFromPath(filePath),
          'Cache-Control': 'no-cache',
        },
      })
    } catch {
      return new Response('Not found.', { status: 404 })
    }
  })
}

function resolveWindowIconPath(): string | null {
  if (!isDevelopment) {
    return null
  }

  if (process.platform === 'darwin') {
    return join(__dirname, '..', 'build', 'icon.icns')
  }

  return join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function applyDevelopmentAppIcon(): void {
  if (!isDevelopment || process.platform !== 'darwin') {
    return
  }

  const iconPath = resolveWindowIconPath()

  if (!iconPath) {
    return
  }

  const icon = nativeImage.createFromPath(iconPath)

  if (!icon.isEmpty() && app.dock) {
    app.dock.setIcon(icon)
    app.dock.setBadge('')
  }
}

function resolveWindowIcon() {
  const iconPath = resolveWindowIconPath()

  if (!iconPath) {
    return undefined
  }

  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? undefined : icon
}

async function waitForAppIdle(): Promise<void> {
  if (!appContext) {
    return
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    await Promise.race([
      appContext.whenIdle(),
      new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          console.warn(`[changbu] app idle wait timed out after ${APP_IDLE_TIMEOUT_MS}ms, continuing quit.`)
          resolve()
        }, APP_IDLE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

function finishQuit(): void {
  sendQuitState(false)
  appContext?.dispose()
  appContext = null
  unregisterHandlers?.()
  unregisterHandlers = null
  settingsWindow?.destroy()
  settingsWindow = null
  mainWindow?.destroy()
  app.quit()
}

function requestAppQuit(): void {
  if (isQuitting || quitTask) {
    return
  }

  sendQuitState(true)
  quitTask = (async () => {
    try {
      await waitForAppIdle()
    } finally {
      isQuitting = true
      quitTask = null
      finishQuit()
    }
  })()
}

function loadRendererWindow(window: BrowserWindow, mode: 'main' | 'settings' = 'main'): void {
  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    if (mode === 'settings') {
      const url = new URL(process.env.VITE_DEV_SERVER_URL)
      url.searchParams.set('window', 'settings')
      void window.loadURL(url.toString())
      return
    }

    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    return
  }

  if (mode === 'settings') {
    void window.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: {
        window: 'settings',
      },
    })
    return
  }

  void window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
}

function createMainWindow(): BrowserWindow {
  const icon = resolveWindowIcon()
  const window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f5f5f5',
    title: '长布',
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      height: 28,
    },
    ...(icon ? { icon } : {}),
    ...(process.platform === 'darwin' ? { vibrancy: 'sidebar' } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  })

  loadRendererWindow(window, 'main')

  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.on('close', (event) => {
    if (process.platform === 'darwin' || isQuitting || !appContext) {
      return
    }

    event.preventDefault()
    requestAppQuit()
  })

  return window
}

function createSettingsWindow(): BrowserWindow {
  const icon = resolveWindowIcon()
  const window = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#f7f5f2',
    title: '设置 - 长布',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  })

  loadRendererWindow(window, 'settings')

  if (process.platform === 'darwin') {
    window.setWindowButtonVisibility(false)
  }

  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

function openMainWindow(): BrowserWindow {
  const window = createMainWindow()
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })
  return window
}

function openSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }

    settingsWindow.focus()
    return settingsWindow
  }

  const window = createSettingsWindow()
  settingsWindow = window
  window.on('closed', () => {
    if (settingsWindow === window) {
      settingsWindow = null
    }
  })
  return window
}

async function bootstrap(): Promise<void> {
  const userDataDirectory = app.getPath('userData')
  const dataDirectory = join(userDataDirectory, 'data')
  const settingsFilePath = join(userDataDirectory, 'changbu-settings.json')

  applyDevelopmentAppIcon()
  await registerAttachmentProtocol(dataDirectory)

  appContext = createAppContext({
    dataDirectory,
    settingsFilePath,
    openPath: shell.openPath,
    chooseOpenPaths: async ({ title, filters, properties }) => {
      const result = await dialog.showOpenDialog({
        title,
        filters,
        properties,
      })

      return result.canceled ? [] : result.filePaths
    },
    chooseSavePath: async ({ title, defaultPath, filters }) => {
      const result = await dialog.showSaveDialog({
        title,
        defaultPath,
        filters,
      })

      return result.canceled ? null : result.filePath ?? null
    },
    chooseDirectory: async (title) => {
      const result = await dialog.showOpenDialog({
        title,
        properties: ['openDirectory'],
      })

      return result.canceled ? null : result.filePaths[0] ?? null
    },
    onBlockChanged: (event) => sendEvent(IPC_CHANNELS.events.blockChanged, event),
    onNotebooksChanged: (event) => sendEvent(IPC_CHANNELS.events.notebooksChanged, event),
    onMetaChanged: (event) => sendEvent(IPC_CHANNELS.events.metaChanged, event),
    onCalendarChanged: (event) => sendEvent(IPC_CHANNELS.events.calendarChanged, event),
    onDocGenerationChunk: (chunk) => sendEvent(IPC_CHANNELS.events.docGenerationChunk, chunk),
  })

  unregisterHandlers = registerIpcHandlers(appContext, {
    [IPC_CHANNELS.settings.openWindow]: () => {
      openSettingsWindow()
    },
  })
  openMainWindow()
}

app.whenReady().then(() => {
  app.setName(APP_NAME)
  void bootstrap()

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      openMainWindow()
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isQuitting || !appContext) {
    return
  }

  event.preventDefault()
  requestAppQuit()
})
