// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc'
import type { DocGenerationChunk, RendererExportOptions } from '../../shared/types'
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

    const notebook = await handlers[IPC_CHANNELS.notebooks.create]({}, '路线图')
    const notebookAdded = await handlers[IPC_CHANNELS.notebooks.addBlock]({}, notebook.id, created.id)
    expect(notebookAdded.added).toBe(true)
    expect(notebookAdded.notebook.items.filter((item) => item.type === 'block')).toHaveLength(1)

    const started = await handlers[IPC_CHANNELS.search.generate]({}, 'PRD')
    expect(started.requestId).toBeTruthy()

    await context.whenIdle()

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.at(-1)?.done).toBe(true)
  })

  it('drops renderer-supplied file system paths from import and export handlers', async () => {
    const exportMarkdown = vi.fn(async () => null)
    const exportJson = vi.fn(async () => null)
    const previewImportMarkdown = vi.fn(async () => null)
    const previewImportJson = vi.fn(async () => null)
    const handlers = createIpcHandlers({
      exportMarkdown,
      exportJson,
      previewImportMarkdown,
      previewImportJson,
    } as unknown as AppContext)

    await (handlers[IPC_CHANNELS.exports.markdown] as (...args: unknown[]) => Promise<unknown>)({}, {
      includeAttachments: true,
      tagFilter: ['项目'],
      dateRange: { start: '2026-04-01' },
      targetPath: '/tmp/should-be-ignored',
    } as RendererExportOptions & { targetPath: string })
    await (handlers[IPC_CHANNELS.exports.json] as (...args: unknown[]) => Promise<unknown>)({}, {
      includeAttachments: false,
      targetPath: '/tmp/should-be-ignored.json',
    } as RendererExportOptions & { targetPath: string })
    await (handlers[IPC_CHANNELS.imports.previewMarkdown] as (...args: unknown[]) => Promise<unknown>)({}, ['/tmp/should-not-pass.md'])
    await (handlers[IPC_CHANNELS.imports.previewJson] as (...args: unknown[]) => Promise<unknown>)({}, '/tmp/should-not-pass.json')

    expect(exportMarkdown).toHaveBeenCalledWith({
      includeAttachments: true,
      tagFilter: ['项目'],
      dateRange: { start: '2026-04-01' },
    })
    expect(exportJson).toHaveBeenCalledWith({
      includeAttachments: false,
      tagFilter: undefined,
      dateRange: undefined,
    })
    expect(previewImportMarkdown.mock.calls[0]).toEqual([])
    expect(previewImportJson.mock.calls[0]).toEqual([])
  })
})
