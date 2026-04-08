import { parentPort, workerData } from 'node:worker_threads'

import { IPC_CHANNELS } from '../shared/ipc'
import { createAppContext } from './appContext'
import type { AppContextOptions } from './appContext-types'
import {
  deserializeWorkerError,
  serializeWorkerError,
  type AppContextHostMethod,
  type AppContextWorkerBootstrapData,
  type AppContextWorkerHostResponseMessage,
  type AppContextWorkerInboundMessage,
  type AppContextWorkerOutboundMessage,
} from './appContextWorkerProtocol'

if (!parentPort) {
  throw new Error('App context worker must run inside a worker thread.')
}

const port = parentPort

const bootstrapData = workerData as AppContextWorkerBootstrapData
const hostMethods = new Set<AppContextHostMethod>(bootstrapData.hostMethods)
const pendingHostCalls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let nextHostRequestId = 1

function postMessage(message: AppContextWorkerOutboundMessage): void {
  port.postMessage(message)
}

async function invokeHostMethod<T>(method: AppContextHostMethod, ...args: unknown[]): Promise<T> {
  if (!hostMethods.has(method)) {
    throw new Error(`Host method "${method}" is not available.`)
  }

  const requestId = nextHostRequestId
  nextHostRequestId += 1

  return new Promise<T>((resolve, reject) => {
    pendingHostCalls.set(requestId, {
      resolve: (value) => {
        resolve(value as T)
      },
      reject,
    })
    postMessage({
      type: 'host-call',
      requestId,
      method,
      args,
    })
  })
}

function resolveHostResponse(message: AppContextWorkerHostResponseMessage): void {
  const pending = pendingHostCalls.get(message.requestId)

  if (!pending) {
    return
  }

  pendingHostCalls.delete(message.requestId)

  if (message.error) {
    pending.reject(deserializeWorkerError(message.error))
    return
  }

  pending.resolve(message.result)
}

const appContextOptions: AppContextOptions = {
  dataDirectory: bootstrapData.dataDirectory,
  settingsFilePath: bootstrapData.settingsFilePath,
  cliLaunchSpec: bootstrapData.cliLaunchSpec,
  externalSkillRootDirectory: bootstrapData.externalSkillRootDirectory,
  onBlockChanged: (event) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.blockChanged,
      payload: event,
    })
  },
  onNotebooksChanged: (event) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.notebooksChanged,
      payload: event,
    })
  },
  onMetaChanged: (event) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.metaChanged,
      payload: event,
    })
  },
  onCalendarChanged: (event) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.calendarChanged,
      payload: event,
    })
  },
  onDocGenerationChunk: (chunk) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.docGenerationChunk,
      payload: chunk,
    })
  },
  onReviewGenerationChunk: (chunk) => {
    postMessage({
      type: 'event',
      channel: IPC_CHANNELS.events.reviewGenerationChunk,
      payload: chunk,
    })
  },
  ...(hostMethods.has('openPath')
    ? {
        openPath: (targetPath: string) => invokeHostMethod<string>('openPath', targetPath),
      }
    : {}),
  ...(hostMethods.has('chooseOpenPaths')
    ? {
        chooseOpenPaths: (options: Parameters<NonNullable<AppContextOptions['chooseOpenPaths']>>[0]) =>
          invokeHostMethod<string[]>('chooseOpenPaths', options),
      }
    : {}),
  ...(hostMethods.has('chooseSavePath')
    ? {
        chooseSavePath: (options: Parameters<NonNullable<AppContextOptions['chooseSavePath']>>[0]) =>
          invokeHostMethod<string | null>('chooseSavePath', options),
      }
    : {}),
  ...(hostMethods.has('chooseDirectory')
    ? {
        chooseDirectory: (title: string) => invokeHostMethod<string | null>('chooseDirectory', title),
      }
    : {}),
}

const context = createAppContext(appContextOptions)

async function handleCall(message: Extract<AppContextWorkerInboundMessage, { type: 'call' }>): Promise<void> {
  try {
    const method = (context as unknown as Record<string, (...args: unknown[]) => unknown>)[message.method]

    if (typeof method !== 'function') {
      throw new Error(`Unknown app context method: ${message.method}`)
    }

    const result = await method(...message.args)

    postMessage({
      type: 'response',
      requestId: message.requestId,
      result,
    })
  } catch (error) {
    postMessage({
      type: 'response',
      requestId: message.requestId,
      error: serializeWorkerError(error),
    })
  }
}

port.on('message', (message: AppContextWorkerInboundMessage) => {
  if (message.type === 'host-response') {
    resolveHostResponse(message)
    return
  }

  void handleCall(message)
})

postMessage({
  type: 'ready',
})

port.on('close', () => {
  context.dispose()
})
