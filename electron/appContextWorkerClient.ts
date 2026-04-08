import { Worker } from 'node:worker_threads'
import { join } from 'node:path'

import type { AppContext, AppContextOptions } from './appContext-types'
import {
  deserializeWorkerError,
  serializeWorkerError,
  type AppContextEventPayload,
  type AppContextHostMethod,
  type AppContextWorkerBootstrapData,
  type AppContextWorkerHostCallMessage,
  type AppContextWorkerInboundMessage,
  type AppContextWorkerOutboundMessage,
} from './appContextWorkerProtocol'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface WorkerTransport {
  postMessage(message: AppContextWorkerInboundMessage): void
  on(event: 'message', listener: (message: AppContextWorkerOutboundMessage) => void): this
  off(event: 'message', listener: (message: AppContextWorkerOutboundMessage) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  off(event: 'error', listener: (error: Error) => void): this
  on(event: 'exit', listener: (code: number) => void): this
  off(event: 'exit', listener: (code: number) => void): this
  terminate(): Promise<number>
}

export interface AppContextWorkerClientOptions {
  dataDirectory: string
  settingsFilePath?: string
  cliLaunchSpec?: AppContextWorkerBootstrapData['cliLaunchSpec']
  externalSkillRootDirectory?: string
  workerPath?: string
  transport?: WorkerTransport
  host: Pick<AppContextOptions, AppContextHostMethod>
  onEvent?: (channel: string, payload: AppContextEventPayload) => void
  onError?: (error: Error) => void
}

export interface AppContextWorkerClient {
  context: AppContext
  ready: Promise<void>
  terminate(): Promise<void>
}

function createHostMethodMap(options: Pick<AppContextOptions, AppContextHostMethod>) {
  return {
    openPath: options.openPath,
    chooseOpenPaths: options.chooseOpenPaths,
    chooseSavePath: options.chooseSavePath,
    chooseDirectory: options.chooseDirectory,
  } satisfies Pick<AppContextOptions, AppContextHostMethod>
}

function getAvailableHostMethods(options: Pick<AppContextOptions, AppContextHostMethod>): AppContextHostMethod[] {
  const hostMethodMap = createHostMethodMap(options)
  return (Object.entries(hostMethodMap) as Array<[AppContextHostMethod, AppContextOptions[AppContextHostMethod]]>)
    .filter(([, handler]) => typeof handler === 'function')
    .map(([method]) => method)
}

class AppContextWorkerClientImpl implements AppContextWorkerClient {
  readonly context: AppContext
  readonly ready: Promise<void>

  private readonly hostMethodMap: Pick<AppContextOptions, AppContextHostMethod>
  private readonly transport: WorkerTransport
  private readonly pendingRequests = new Map<number, PendingRequest>()
  private readonly readyPromise: Promise<void>
  private readonly onEvent?: (channel: string, payload: AppContextEventPayload) => void
  private readonly onError?: (error: Error) => void
  private readyResolve: (() => void) | null = null
  private readyReject: ((reason?: unknown) => void) | null = null
  private nextRequestId = 1
  private terminated = false
  private terminatePromise: Promise<void> | null = null

  constructor(options: AppContextWorkerClientOptions) {
    this.hostMethodMap = createHostMethodMap(options.host)
    this.transport = options.transport ?? new Worker(options.workerPath ?? join(__dirname, 'appContextWorker.cjs'), {
      workerData: {
        dataDirectory: options.dataDirectory,
        settingsFilePath: options.settingsFilePath,
        cliLaunchSpec: options.cliLaunchSpec,
        externalSkillRootDirectory: options.externalSkillRootDirectory,
        hostMethods: getAvailableHostMethods(options.host),
      } satisfies AppContextWorkerBootstrapData,
    })
    this.onEvent = options.onEvent
    this.onError = options.onError
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.ready = this.readyPromise
    this.context = this.createContextProxy()

    this.transport.on('message', this.handleMessage)
    this.transport.on('error', this.handleTransportError)
    this.transport.on('exit', this.handleTransportExit)
  }

  async terminate(): Promise<void> {
    if (this.terminatePromise) {
      return this.terminatePromise
    }

    this.terminated = true
    this.terminatePromise = (async () => {
      try {
        await this.readyPromise
        await this.callWorker('dispose', [], { allowAfterTerminate: true })
      } catch {
        // ignore readiness or disposal errors during shutdown
      }

      this.rejectPending(new Error('App context worker was terminated.'))
      this.detachTransportListeners()
      await this.transport.terminate()
    })()

    return this.terminatePromise
  }

  private readonly handleMessage = (message: AppContextWorkerOutboundMessage): void => {
    if (message.type === 'ready') {
      this.readyResolve?.()
      this.readyResolve = null
      this.readyReject = null
      return
    }

    if (message.type === 'event') {
      this.onEvent?.(message.channel, message.payload)
      return
    }

    if (message.type === 'host-call') {
      void this.handleHostCall(message)
      return
    }

    const pending = this.pendingRequests.get(message.requestId)

    if (!pending) {
      return
    }

    this.pendingRequests.delete(message.requestId)

    if (message.error) {
      pending.reject(deserializeWorkerError(message.error))
      return
    }

    pending.resolve(message.result)
  }

  private readonly handleTransportError = (error: Error): void => {
    this.readyReject?.(error)
    this.readyResolve = null
    this.readyReject = null
    this.rejectPending(error)
    this.onError?.(error)
  }

  private readonly handleTransportExit = (code: number): void => {
    if (!this.terminated) {
      const error = new Error(`App context worker exited unexpectedly with code ${code}.`)
      this.readyReject?.(error)
      this.readyResolve = null
      this.readyReject = null
      this.rejectPending(error)
      this.onError?.(error)
    }

    this.detachTransportListeners()
  }

  private detachTransportListeners(): void {
    this.transport.off('message', this.handleMessage)
    this.transport.off('error', this.handleTransportError)
    this.transport.off('exit', this.handleTransportExit)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }

    this.pendingRequests.clear()
  }

  private async handleHostCall(message: AppContextWorkerHostCallMessage): Promise<void> {
    const handler = this.hostMethodMap[message.method]

    if (!handler) {
      this.transport.postMessage({
        type: 'host-response',
        requestId: message.requestId,
        error: serializeWorkerError(new Error(`Host method "${message.method}" is not configured.`)),
      })
      return
    }

    try {
      const result = await (handler as (...args: unknown[]) => unknown)(...message.args)
      this.transport.postMessage({
        type: 'host-response',
        requestId: message.requestId,
        result,
      })
    } catch (error) {
      this.transport.postMessage({
        type: 'host-response',
        requestId: message.requestId,
        error: serializeWorkerError(error),
      })
    }
  }

  private createContextProxy(): AppContext {
    return new Proxy({}, {
      get: (_target, property) => {
        if (property === 'dispose') {
          return () => {
            void this.terminate()
          }
        }

        if (property === 'then' || typeof property !== 'string') {
          return undefined
        }

        return (...args: unknown[]) => this.callWorker(property, args)
      },
    }) as AppContext
  }

  private async callWorker<T>(method: string, args: unknown[], options: { allowAfterTerminate?: boolean } = {}): Promise<T> {
    if (this.terminated && !options.allowAfterTerminate) {
      throw new Error('App context worker is not available.')
    }

    await this.readyPromise

    return new Promise<T>((resolve, reject) => {
      const requestId = this.nextRequestId
      this.nextRequestId += 1
      this.pendingRequests.set(requestId, {
        resolve: (value) => {
          resolve(value as T)
        },
        reject,
      })
      this.transport.postMessage({
        type: 'call',
        requestId,
        method,
        args,
      })
    })
  }
}

export function createAppContextWorkerClient(options: AppContextWorkerClientOptions): AppContextWorkerClient {
  return new AppContextWorkerClientImpl(options)
}
