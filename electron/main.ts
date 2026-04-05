import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, protocol, shell } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { BlockChangedEvent, CalendarChangedEvent, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent } from '../shared/types'
import { createAppContext, type AppContext } from './appContext'
import { registerIpcHandlers } from './ipc/register'

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const preloadPath = join(__dirname, 'preload.cjs')
const ATTACHMENT_PROTOCOL = 'changbu-attachment'
let mainWindow: BrowserWindow | null = null
let appContext: AppContext | null = null
let unregisterHandlers: (() => void) | null = null

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
  payload: BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | CalendarChangedEvent | DocGenerationChunk,
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
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

function createMainWindow(): BrowserWindow {
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
    ...(process.platform === 'darwin' ? { vibrancy: 'sidebar' } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }

  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(1)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

async function bootstrap(): Promise<void> {
  const userDataDirectory = app.getPath('userData')
  const dataDirectory = join(userDataDirectory, 'data')
  const settingsFilePath = join(userDataDirectory, 'changbu-settings.json')

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

  unregisterHandlers = registerIpcHandlers(appContext)
  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting || !appContext) {
    return
  }

  event.preventDefault()
  isQuitting = true

  void (async () => {
    try {
      await appContext.whenIdle()
    } finally {
      appContext.dispose()
      unregisterHandlers?.()
      app.quit()
    }
  })()
})
