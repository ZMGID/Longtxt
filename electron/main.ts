import { join } from 'node:path'

import { app, BrowserWindow, dialog, shell } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { BlockChangedEvent, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent } from '../shared/types'
import { createAppContext, type AppContext } from './appContext'
import { registerIpcHandlers } from './ipc/register'

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const preloadPath = join(__dirname, 'preload.cjs')
let mainWindow: BrowserWindow | null = null
let appContext: AppContext | null = null
let unregisterHandlers: (() => void) | null = null

function sendEvent(channel: string, payload: BlockChangedEvent | NotebookChangedEvent | MetaChangedEvent | DocGenerationChunk): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f5f5f5',
    title: '长布',
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      height: 36,
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
    window.webContents.setZoomFactor(1.1)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

async function bootstrap(): Promise<void> {
  const dataDirectory = join(app.getPath('userData'), 'data')

  appContext = createAppContext({
    dataDirectory,
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
