import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, nativeImage, protocol, shell } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { AppEventBatch, BlockChangedEvent, CalendarChangedEvent, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent, ReviewGenerationChunk } from '../shared/types'
import { createAppContext, type AppContext } from './appContext'
import { createAppContextWorkerClient, type AppContextWorkerClient } from './appContextWorkerClient'
import { runChangbuCli } from './cli'
import { registerIpcHandlers } from './ipc/register'

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const APP_NAME = '长布'
const DEFAULT_ZOOM_FACTOR = 1.1
const APP_IDLE_TIMEOUT_MS = 15_000
const EVENT_BATCH_WINDOW_MS = 80
const preloadPath = join(__dirname, 'preload.cjs')
const ATTACHMENT_PROTOCOL = 'changbu-attachment'
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let reviewWindow: BrowserWindow | null = null
let appContext: AppContext | null = null
let appContextClient: AppContextWorkerClient | null = null
let unregisterHandlers: (() => void) | null = null
let isQuitting = false
let quitTask: Promise<void> | null = null
let pendingRendererBatch: AppEventBatch = {
  blockChanges: [],
  blockPayloads: {},
  notebookChanges: [],
  metaChanges: [],
  calendarChanges: [],
}
let pendingRendererBatchTimer: ReturnType<typeof setTimeout> | null = null
const cliArgs = (() => {
  const cliIndex = process.argv.indexOf('--cli')
  return cliIndex === -1 ? null : process.argv.slice(cliIndex + 1)
})()
const isCliMode = cliArgs !== null

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
  payload: AppEventBatch | BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | CalendarChangedEvent | DocGenerationChunk | ReviewGenerationChunk | { waiting: boolean },
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function resetPendingRendererBatch(): void {
  pendingRendererBatch = {
    blockChanges: [],
    blockPayloads: {},
    notebookChanges: [],
    metaChanges: [],
    calendarChanges: [],
  }
}

function flushPendingRendererBatch(): void {
  if (pendingRendererBatchTimer) {
    clearTimeout(pendingRendererBatchTimer)
    pendingRendererBatchTimer = null
  }

  const hasChanges = pendingRendererBatch.blockChanges.length > 0
    || pendingRendererBatch.notebookChanges.length > 0
    || pendingRendererBatch.metaChanges.length > 0
    || pendingRendererBatch.calendarChanges.length > 0

  if (!hasChanges) {
    resetPendingRendererBatch()
    return
  }

  sendEvent(IPC_CHANNELS.events.batch, pendingRendererBatch)
  resetPendingRendererBatch()
}

function scheduleRendererBatchFlush(): void {
  if (pendingRendererBatchTimer) {
    return
  }

  pendingRendererBatchTimer = setTimeout(() => {
    flushPendingRendererBatch()
  }, EVENT_BATCH_WINDOW_MS)
}

function queueRendererBatchEvent(channel: string, payload: BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | CalendarChangedEvent): void {
  switch (channel) {
    case IPC_CHANNELS.events.blockChanged: {
      const blockPayload = payload as BlockChangedEvent
      const previousIndex = pendingRendererBatch.blockChanges.findIndex((event) => event.blockId === blockPayload.block.id)
      const previous = previousIndex === -1 ? null : pendingRendererBatch.blockChanges[previousIndex] ?? null
      const nextReason = previous?.reason === 'created' && blockPayload.reason !== 'deleted'
        ? 'created'
        : blockPayload.reason

      if (previous?.reason === 'created' && blockPayload.reason === 'deleted') {
        pendingRendererBatch.blockChanges.splice(previousIndex, 1)
        delete pendingRendererBatch.blockPayloads[blockPayload.block.id]
        break
      }

      if (blockPayload.reason === 'deleted') {
        delete pendingRendererBatch.blockPayloads[blockPayload.block.id]
      } else {
        pendingRendererBatch.blockPayloads[blockPayload.block.id] = blockPayload.block
      }

      const nextChange = {
        blockId: blockPayload.block.id,
        reason: nextReason,
      }

      if (previousIndex === -1) {
        pendingRendererBatch.blockChanges.push(nextChange)
      } else {
        pendingRendererBatch.blockChanges[previousIndex] = nextChange
      }

      break
    }
    case IPC_CHANNELS.events.notebooksChanged: {
      const notebookPayload = payload as NotebookChangedEvent
      const key = `${notebookPayload.reason}::${[...notebookPayload.notebookIds].sort().join(',')}`

      if (!pendingRendererBatch.notebookChanges.some((event) => `${event.reason}::${[...event.notebookIds].sort().join(',')}` === key)) {
        pendingRendererBatch.notebookChanges.push(notebookPayload)
      }
      break
    }
    case IPC_CHANNELS.events.metaChanged: {
      const metaPayload = payload as MetaChangedEvent

      if (!pendingRendererBatch.metaChanges.some((event) => event.reason === metaPayload.reason)) {
        pendingRendererBatch.metaChanges.push(metaPayload)
      }
      break
    }
    case IPC_CHANNELS.events.calendarChanged: {
      const calendarPayload = payload as CalendarChangedEvent
      const key = `${calendarPayload.reason}::${calendarPayload.date ?? ''}::${calendarPayload.sourceBlockId ?? ''}`

      if (!pendingRendererBatch.calendarChanges.some((event) => `${event.reason}::${event.date ?? ''}::${event.sourceBlockId ?? ''}` === key)) {
        pendingRendererBatch.calendarChanges.push(calendarPayload)
      }
      break
    }
    default:
      return
  }

  scheduleRendererBatchFlush()
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

async function finishQuit(): Promise<void> {
  flushPendingRendererBatch()
  sendQuitState(false)
  const activeContextClient = appContextClient
  appContext = null
  appContextClient = null
  unregisterHandlers?.()
  unregisterHandlers = null
  settingsWindow?.destroy()
  settingsWindow = null
  reviewWindow?.destroy()
  reviewWindow = null
  mainWindow?.destroy()
  await activeContextClient?.terminate()
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
      await finishQuit()
    }
  })()
}

function loadRendererWindow(
  window: BrowserWindow,
  mode: 'main' | 'settings' | 'review' = 'main',
  options: { reviewMode?: string; dateKey?: string } = {},
): void {
  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    if (mode === 'settings' || mode === 'review') {
      const url = new URL(process.env.VITE_DEV_SERVER_URL)
      url.searchParams.set('window', mode)

      if (mode === 'review') {
        if (options.reviewMode) {
          url.searchParams.set('mode', options.reviewMode)
        }

        if (options.dateKey) {
          url.searchParams.set('date', options.dateKey)
        }
      }

      void window.loadURL(url.toString())
      return
    }

    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    return
  }

  if (mode === 'settings' || mode === 'review') {
    void window.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: {
        window: mode,
        ...(mode === 'review' && options.reviewMode ? { mode: options.reviewMode } : {}),
        ...(mode === 'review' && options.dateKey ? { date: options.dateKey } : {}),
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
    minWidth: 620,
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

function createReviewWindow(reviewMode: string, dateKey?: string): BrowserWindow {
  const icon = resolveWindowIcon()
  const reviewWindowTitle = reviewMode === 'ai-insights'
    ? 'AI 洞察 - 长布'
    : reviewMode === 'recent-shifts'
      ? '近期变化 - 长布'
      : '每日回顾 - 长布'
  const window = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f7f5f2',
    title: reviewWindowTitle,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  })

  loadRendererWindow(window, 'review', { reviewMode, dateKey })

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

function openReviewWindow(reviewMode: string, dateKey?: string): BrowserWindow {
  if (reviewWindow && !reviewWindow.isDestroyed()) {
    reviewWindow.setTitle(
      reviewMode === 'ai-insights'
        ? 'AI 洞察 - 长布'
        : reviewMode === 'recent-shifts'
          ? '近期变化 - 长布'
          : '每日回顾 - 长布',
    )
    loadRendererWindow(reviewWindow, 'review', { reviewMode, dateKey })

    if (reviewWindow.isMinimized()) {
      reviewWindow.restore()
    }

    reviewWindow.focus()
    return reviewWindow
  }

  const window = createReviewWindow(reviewMode, dateKey)
  reviewWindow = window
  window.on('closed', () => {
    if (reviewWindow === window) {
      reviewWindow = null
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

  appContextClient = createAppContextWorkerClient({
    dataDirectory,
    settingsFilePath,
    cliLaunchSpec: {
      executablePath: process.execPath,
      args: app.isPackaged ? [] : [join(__dirname, 'main.cjs')],
    },
    host: {
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
    },
    onEvent: (channel, payload) => {
      if (
        channel === IPC_CHANNELS.events.blockChanged
        || channel === IPC_CHANNELS.events.notebooksChanged
        || channel === IPC_CHANNELS.events.metaChanged
        || channel === IPC_CHANNELS.events.calendarChanged
      ) {
        queueRendererBatchEvent(channel, payload as BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | CalendarChangedEvent)
        return
      }

      sendEvent(channel, payload)
    },
    onError: (error) => {
      console.error('[changbu] app context worker failed:', error)
    },
  })

  await appContextClient.ready

  appContext = appContextClient.context

  unregisterHandlers = registerIpcHandlers(appContext, {
    [IPC_CHANNELS.settings.openWindow]: () => {
      openSettingsWindow()
    },
    [IPC_CHANNELS.review.openWindow]: (_event: unknown, ...args: unknown[]) => {
      const [reviewMode, dateKey] = args as [string, string | undefined]
      openReviewWindow(reviewMode, dateKey)
    },
  })

  openMainWindow()
}

async function runCliMode(args: string[]): Promise<void> {
  const userDataDirectory = app.getPath('userData')
  const dataDirectory = join(userDataDirectory, 'data')
  const settingsFilePath = join(userDataDirectory, 'changbu-settings.json')
  const context = createAppContext({
    dataDirectory,
    settingsFilePath,
    cliLaunchSpec: {
      executablePath: process.execPath,
      args: app.isPackaged ? [] : [join(__dirname, 'main.cjs')],
    },
  })

  let exitCode = 0

  try {
    exitCode = await runChangbuCli(context, args)
    await context.whenIdle()
  } catch (error) {
    exitCode = 1
    process.stderr.write(`${error instanceof Error ? error.message : 'CLI 执行失败。'}\n`)
  } finally {
    context.dispose()
    isQuitting = true
    app.exit(exitCode)
  }
}

app.whenReady().then(() => {
  app.setName(APP_NAME)

  if (isCliMode) {
    void runCliMode(cliArgs ?? [])
    return
  }

  void bootstrap().catch((error) => {
    console.error('[changbu] bootstrap failed:', error)
    dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : '应用启动失败。')
    app.exit(1)
  })

  app.on('activate', () => {
    if (!appContext) {
      return
    }

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
  if (isCliMode) {
    return
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isCliMode) {
    return
  }

  if (isQuitting || !appContext) {
    return
  }

  event.preventDefault()
  requestAppQuit()
})
