import type {
  BlockChangedEvent,
  CalendarChangedEvent,
  DocGenerationChunk,
  MetaChangedEvent,
  NotebookChangedEvent,
  ReviewGenerationChunk,
} from '../shared/types'
import type { AppContextOptions } from './appContext-types'

export type AppContextHostMethod = 'openPath' | 'chooseOpenPaths' | 'chooseSavePath' | 'chooseDirectory'

export type AppContextEventPayload =
  | BlockChangedEvent
  | NotebookChangedEvent
  | MetaChangedEvent
  | CalendarChangedEvent
  | DocGenerationChunk
  | ReviewGenerationChunk

export interface SerializedWorkerError {
  message: string
  name: string
  stack?: string
}

export interface AppContextWorkerBootstrapData {
  dataDirectory: string
  settingsFilePath?: string
  cliLaunchSpec?: AppContextOptions['cliLaunchSpec']
  externalSkillRootDirectory?: string
  hostMethods: AppContextHostMethod[]
}

export interface AppContextWorkerCallMessage {
  type: 'call'
  requestId: number
  method: string
  args: unknown[]
}

export interface AppContextWorkerResponseMessage {
  type: 'response'
  requestId: number
  result?: unknown
  error?: SerializedWorkerError
}

export interface AppContextWorkerReadyMessage {
  type: 'ready'
}

export interface AppContextWorkerEventMessage {
  type: 'event'
  channel: string
  payload: AppContextEventPayload
}

export interface AppContextWorkerHostCallMessage {
  type: 'host-call'
  requestId: number
  method: AppContextHostMethod
  args: unknown[]
}

export interface AppContextWorkerHostResponseMessage {
  type: 'host-response'
  requestId: number
  result?: unknown
  error?: SerializedWorkerError
}

export type AppContextWorkerInboundMessage =
  | AppContextWorkerCallMessage
  | AppContextWorkerHostResponseMessage

export type AppContextWorkerOutboundMessage =
  | AppContextWorkerReadyMessage
  | AppContextWorkerResponseMessage
  | AppContextWorkerEventMessage
  | AppContextWorkerHostCallMessage

export function serializeWorkerError(error: unknown): SerializedWorkerError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: typeof error === 'string' ? error : String(error),
    name: 'Error',
  }
}

export function deserializeWorkerError(error: SerializedWorkerError): Error {
  const restored = new Error(error.message)
  restored.name = error.name

  if (error.stack) {
    restored.stack = error.stack
  }

  return restored
}
