// @vitest-environment node

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { createAppContextWorkerClient } from '../appContextWorkerClient'
import type { AppContextWorkerInboundMessage, AppContextWorkerOutboundMessage } from '../appContextWorkerProtocol'

class FakeTransport extends EventEmitter {
  readonly sentMessages: AppContextWorkerInboundMessage[] = []
  onPostMessage?: (message: AppContextWorkerInboundMessage) => void
  readonly terminate = vi.fn(async () => 1)

  override on(event: 'message', listener: (message: AppContextWorkerOutboundMessage) => void): this
  override on(event: 'error', listener: (error: Error) => void): this
  override on(event: 'exit', listener: (code: number) => void): this
  override on(
    event: 'message' | 'error' | 'exit',
    listener: ((message: AppContextWorkerOutboundMessage) => void) | ((error: Error) => void) | ((code: number) => void),
  ): this {
    return super.on(event, listener)
  }

  override off(event: 'message', listener: (message: AppContextWorkerOutboundMessage) => void): this
  override off(event: 'error', listener: (error: Error) => void): this
  override off(event: 'exit', listener: (code: number) => void): this
  override off(
    event: 'message' | 'error' | 'exit',
    listener: ((message: AppContextWorkerOutboundMessage) => void) | ((error: Error) => void) | ((code: number) => void),
  ): this {
    return super.off(event, listener)
  }

  postMessage(message: AppContextWorkerInboundMessage): void {
    this.sentMessages.push(message)
    this.onPostMessage?.(message)
  }

  emitMessage(message: AppContextWorkerOutboundMessage): void {
    this.emit('message', message)
  }
}

function createHostOptions() {
  return {
    openPath: undefined,
    chooseOpenPaths: undefined,
    chooseSavePath: undefined,
    chooseDirectory: undefined,
  }
}

describe('appContext worker client', () => {
  it('waits for worker readiness and resolves proxied method calls', async () => {
    const transport = new FakeTransport()
    transport.onPostMessage = (message) => {
      if (message.type !== 'call') {
        return
      }

      queueMicrotask(() => {
        transport.emitMessage({
          type: 'response',
          requestId: message.requestId,
          result: {
            items: [{ id: 'block-1', content: 'worker ready' }],
            nextCursor: null,
            hasMore: false,
          },
        })
      })
    }

    const client = createAppContextWorkerClient({
      dataDirectory: '/tmp/changbu-worker-test',
      transport,
      host: createHostOptions(),
    })

    const pendingResult = client.context.listBlocks({ limit: 20, cursor: null })
    expect(transport.sentMessages).toHaveLength(0)

    transport.emitMessage({ type: 'ready' })

    await expect(pendingResult).resolves.toEqual({
      items: [{ id: 'block-1', content: 'worker ready' }],
      nextCursor: null,
      hasMore: false,
    })
  })

  it('handles host callbacks requested by the worker', async () => {
    const transport = new FakeTransport()
    const chooseDirectory = vi.fn(async (title: string) => `/tmp/${title}`)
    const client = createAppContextWorkerClient({
      dataDirectory: '/tmp/changbu-worker-test',
      transport,
      host: {
        ...createHostOptions(),
        chooseDirectory,
      },
    })

    transport.emitMessage({ type: 'ready' })
    await client.ready

    transport.emitMessage({
      type: 'host-call',
      requestId: 7,
      method: 'chooseDirectory',
      args: ['导出目录'],
    })

    await new Promise<void>((resolve) => {
      queueMicrotask(() => resolve())
    })

    expect(chooseDirectory).toHaveBeenCalledWith('导出目录')
    expect(transport.sentMessages.at(-1)).toEqual({
      type: 'host-response',
      requestId: 7,
      result: '/tmp/导出目录',
    })
  })

  it('rejects pending requests when the worker exits unexpectedly', async () => {
    const transport = new FakeTransport()
    const client = createAppContextWorkerClient({
      dataDirectory: '/tmp/changbu-worker-test',
      transport,
      host: createHostOptions(),
    })

    transport.emitMessage({ type: 'ready' })
    await client.ready

    const pendingResult = client.context.getMeta()
    await new Promise<void>((resolve) => {
      queueMicrotask(() => resolve())
    })
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'call',
      method: 'getMeta',
    })

    transport.emit('exit', 1)

    await expect(pendingResult).rejects.toThrow('App context worker exited unexpectedly with code 1.')
  })
})
