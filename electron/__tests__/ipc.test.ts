// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc'
import type { DocGenerationChunk } from '../../shared/types'
import { createAppContext, type AppContext } from '../appContext'
import { createIpcHandlers } from '../ipc/register'

const contexts: AppContext[] = []
const directories: string[] = []

function makeContext(chunks: DocGenerationChunk[]): AppContext {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-ipc-'))
  directories.push(directory)

  const context = createAppContext({
    dataDirectory: directory,
    onDocGenerationChunk: (chunk) => {
      chunks.push(chunk)
    },
    openPath: async () => '',
  })

  contexts.push(context)
  return context
}

afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.dispose()
  }

  while (directories.length > 0) {
    const directory = directories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('ipc handlers', () => {
  it('proxies CRUD, search, and streaming generation through the router', async () => {
    const chunks: DocGenerationChunk[] = []
    const context = makeContext(chunks)
    const handlers = createIpcHandlers(context)

    const created = await handlers[IPC_CHANNELS.blocks.create]({}, '给长布补一个 PRD 主链路')
    await context.whenIdle()

    const listed = await handlers[IPC_CHANNELS.blocks.list]({}, { offset: 0, limit: 20 })
    expect(listed).toHaveLength(1)
    expect(created.id).toBe(listed[0].id)

    const fetched = await handlers[IPC_CHANNELS.blocks.get]({}, created.id)
    expect(fetched.id).toBe(created.id)

    const searchResults = await handlers[IPC_CHANNELS.search.blocks]({}, 'PRD', 20)
    expect(searchResults).toHaveLength(1)

    const added = await handlers[IPC_CHANNELS.tags.add]({}, created.id, '重要')
    expect(added.tags.some((tag) => tag.name === '重要')).toBe(true)

    const byTag = await handlers[IPC_CHANNELS.search.byTag]({}, '重要', 20)
    expect(byTag).toHaveLength(1)

    const started = await handlers[IPC_CHANNELS.search.generate]({}, 'PRD')
    expect(started.requestId).toBeTruthy()

    await context.whenIdle()

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.at(-1)?.done).toBe(true)
  })
})
