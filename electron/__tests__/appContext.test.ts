// @vitest-environment node

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { BLOCK_ENRICH_SETTINGS_KEY, DOC_GENERATION_SETTINGS_KEY } from '../../shared/config'
import type { AIConfig, BlockChangedEvent, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent } from '../../shared/types'
import { createAppContext, type AppContext, type AppContextOptions } from '../appContext'
import { createConfigFingerprint } from '../services/ai'

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0pS0YAAAAASUVORK5CYII='

const createdContexts: AppContext[] = []
const createdDirectories: string[] = []

function buildLiveConfig(): AIConfig {
  return {
    llm: {
      endpoint: 'https://api.example.com',
      apiKey: 'key-1',
      model: 'gpt-4o-mini',
    },
    embedding: {
      endpoint: 'https://api.example.com',
      apiKey: 'key-2',
      model: 'text-embedding-3-small',
    },
  }
}

function makeContextWithDirectory(options: Partial<AppContextOptions> = {}): { context: AppContext; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-test-'))
  createdDirectories.push(directory)

  const context = createAppContext({
    dataDirectory: directory,
    openPath: async () => '',
    ...options,
  })

  createdContexts.push(context)
  return { context, directory }
}

function makeContext(options: Partial<AppContextOptions> = {}): AppContext {
  return makeContextWithDirectory(options).context
}

function openDb(directory: string): Database.Database {
  return new Database(join(directory, 'changbu.sqlite3'))
}

function makeLlmResponse(summary: string, categories: string[] = ['技术'], detailTags: string[] = ['Electron']): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              categories,
              detail_tags: detailTags,
              summary,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function makeBatchLlmResponse(items: Array<{ index: number; summary: string; categories?: string[]; detailTags?: string[] }>): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: items.map((item) => ({
                index: item.index,
                categories: item.categories ?? ['技术'],
                detail_tags: item.detailTags ?? ['Electron'],
                summary: item.summary,
              })),
            }),
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function makeCalendarSuggestionResponse(
  items: Array<{ title: string; date: string; startTime?: string | null; allDay?: boolean; notes?: string | null; evidenceText?: string | null; confidence?: number }>,
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: items.map((item) => ({
                title: item.title,
                date: item.date,
                start_time: item.startTime ?? null,
                all_day: item.allDay ?? !item.startTime,
                notes: item.notes ?? null,
                evidence_text: item.evidenceText ?? null,
                confidence: item.confidence ?? 0.9,
              })),
            }),
          },
        },
      ],
      usage: { prompt_tokens: 6, completion_tokens: 10, total_tokens: 16 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function makeEmbeddingResponse(vectors: number[][]): Response {
  return new Response(
    JSON.stringify({
      data: vectors.map((embedding) => ({ embedding })),
      usage: { prompt_tokens: 3, total_tokens: 3 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function makeEmbeddingResponder(vectors: number[][]): () => Promise<Response> {
  return async () => makeEmbeddingResponse(vectors)
}

function createDeferredTask<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function createDeferredResponse(): {
  promise: Promise<Response>
  resolve: (response: Response) => void
  reject: (error: unknown) => void
} {
  const deferred = createDeferredTask<Response>()
  return deferred
}

async function configureLiveMode(context: AppContext, config = buildLiveConfig(), embeddingDimension = 4): Promise<void> {
  await context.setSetting('ai_config', JSON.stringify(config))
  await context.setSetting(
    'ai_last_test_result',
    JSON.stringify({
      success: true,
      modelsOk: true,
      embeddingOk: true,
      llmOk: true,
      llmStreamingOk: true,
      resolvedBaseUrl: 'https://api.example.com',
      embeddingModel: config.embedding.model,
      embeddingDimension,
      chatModel: config.llm.model,
      checkedAt: new Date().toISOString(),
      configFingerprint: createConfigFingerprint(config),
    }),
  )
}

async function waitForCondition(condition: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await condition()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Timed out waiting for condition.')
}

function formatLocalDate(value: string): string {
  const date = new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

afterEach(() => {
  while (createdContexts.length > 0) {
    createdContexts.pop()?.dispose()
  }

  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('app context', () => {
  it('creates, enriches, updates, deletes, and searches blocks', async () => {
    const context = makeContext()

    const created = await context.createBlock('用 React 和 SQLite 搭一个 MVP 骨架')
    await context.whenIdle()

    const listed = await context.listBlocks()
    expect(listed).toHaveLength(1)
    expect(listed[0].status).toBe('ready')
    expect(listed[0].tags.map((tag) => tag.name)).toContain('前端')
    expect((await context.getBlock(created.id)).id).toBe(created.id)

    const searchResults = await context.searchBlocks('React')
    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].matchSource).toContain('fts')

    const meta = await context.getMeta()
    expect(meta.vectorReady).toBeTypeOf('boolean')
    expect(meta.vectorSchemaReady).toBeTypeOf('boolean')

    await context.updateBlock(created.id, '把搜索与文档生成链路也接进 Electron')
    await context.whenIdle()

    const updatedSearchResults = await context.searchBlocks('Electron')
    expect(updatedSearchResults[0].block.content).toContain('Electron')

    const tags = await context.listTags()
    expect(tags.length).toBeGreaterThanOrEqual(35)

    const blockWithManualTag = await context.addTag(created.id, '重要')
    expect(blockWithManualTag.tags.some((tag) => tag.name === '重要' && tag.source === 'manual')).toBe(true)

    await context.updateBlock(created.id, '继续推进 Electron 打包和数据库 schema')
    await context.whenIdle()

    const preserved = (await context.listBlocks())[0]
    expect(preserved.tags.some((tag) => tag.name === '重要' && tag.source === 'manual')).toBe(true)

    const byTagResults = await context.searchByTag('重要')
    expect(byTagResults).toHaveLength(1)
    expect(byTagResults[0].matchSource).toEqual(['tag'])

    await context.removeBlock(created.id)
    const afterDelete = await context.listBlocks()
    expect(afterDelete).toHaveLength(0)
  })

  it('keeps tag enrichment working when corpus scoring only uses recent blocks', async () => {
    const context = makeContext()

    for (let index = 0; index < 80; index += 1) {
      await context.createBlock(`历史记录 ${index + 1}：整理旅行、阅读和健身碎片。`)
    }

    const created = await context.createBlock('继续排查 React 列表性能，并补上 Electron IPC 联调记录。')
    await context.whenIdle()

    const block = await context.getBlock(created.id)
    const tagNames = block.tags.map((tag) => tag.name)

    expect(block.status).toBe('ready')
    expect(tagNames).toContain('前端')
    expect(tagNames).toContain('项目')
  })

  it('lists newest blocks first across paginated timeline reads', async () => {
    const context = makeContext()

    const first = await context.createBlock('第一条较早的记录。')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await context.createBlock('第二条中间的记录。')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const third = await context.createBlock('第三条最新的记录。')
    await context.whenIdle()

    const firstPage = await context.listBlocks({ offset: 0, limit: 2 })
    const secondPage = await context.listBlocks({ offset: 2, limit: 2 })

    expect(firstPage.map((block) => block.id)).toEqual([third.id, second.id])
    expect(secondPage.map((block) => block.id)).toEqual([first.id])
  })

  it('supports notebook creation, collection, ordering, and notebook-local block creation', async () => {
    const context = makeContext()
    const first = await context.createBlock('第一段内容，适合做提纲。')
    const second = await context.createBlock('第二段内容，适合做案例。')
    await context.whenIdle()

    const notebook = await context.createNotebook('发布准备')
    expect((await context.listNotebooks())).toHaveLength(1)

    const addedFirst = await context.addBlockToNotebook(notebook.id, first.id)
    expect(addedFirst.added).toBe(true)
    expect(addedFirst.notebook.items.filter((item) => item.type === 'block')).toHaveLength(1)

    const addedSecond = await context.addBlockToNotebook(notebook.id, second.id)
    expect(addedSecond.notebook.items.filter((item) => item.type === 'block').map((item) => item.blockId)).toEqual([first.id, second.id])

    const summaryBeforeEdit = (await context.listNotebooks())[0]
    await new Promise((resolve) => setTimeout(resolve, 5))
    await context.updateBlock(first.id, '第一段内容，已经补充成正式提纲。')
    await context.whenIdle()

    const summaryAfterEdit = (await context.listNotebooks())[0]
    expect(new Date(summaryAfterEdit.updatedAt).getTime()).toBeGreaterThan(new Date(summaryBeforeEdit.updatedAt).getTime())

    const initialBlockItems = addedSecond.notebook.items.filter((item) => item.type === 'block')
    const reordered = await context.reorderNotebookItems(notebook.id, [initialBlockItems[1].id, initialBlockItems[0].id])
    expect(reordered.items.filter((item) => item.type === 'block').map((item) => item.blockId)).toEqual([second.id, first.id])

    await context.removeBlock(second.id)
    const summaryAfterBlockDelete = (await context.listNotebooks())[0]
    expect(summaryAfterBlockDelete.blockCount).toBe(1)

    const withNewBlock = await context.createNotebookBlock(notebook.id, '第三段内容，直接在笔记本里新建。')
    expect(withNewBlock.items.filter((item) => item.type === 'block')).toHaveLength(2)

    const withHeading = await context.createNotebookStructureItem(notebook.id, { type: 'heading', content: '发布说明' })
    const headingItem = withHeading.items.find((item) => item.type === 'heading')
    expect(headingItem?.type).toBe('heading')

    if (!headingItem || headingItem.type !== 'heading') {
      throw new Error('Heading item was not created')
    }

    const updatedStructure = await context.updateNotebookStructureItem(notebook.id, headingItem.id, { content: '正式发布说明' })
    expect(updatedStructure.items.find((item) => item.id === headingItem.id && item.type === 'heading')).toMatchObject({
      content: '正式发布说明',
    })

    const renamed = await context.updateNotebook(notebook.id, '发布串讲')
    expect(renamed.title).toBe('发布串讲')

    const firstNotebookItem = renamed.items.find((item) => item.type === 'block' && item.blockId === first.id)

    if (!firstNotebookItem) {
      throw new Error('First notebook block item was not found')
    }

    const afterRemoval = await context.removeNotebookItem(notebook.id, firstNotebookItem.id)
    expect(afterRemoval.items.filter((item) => item.type === 'block').map((item) => item.blockId)).not.toContain(first.id)

    await context.removeNotebook(notebook.id)
    expect(await context.listNotebooks()).toEqual([])
  })

  it('does not leave an orphan block behind when notebook-local creation fails', async () => {
    const context = makeContext()

    await expect(context.createNotebookBlock('missing-notebook', '不应该被创建的块')).rejects.toThrow()
    expect(await context.listBlocks()).toEqual([])
  })

  it('emits notebook change events for notebook CRUD, item changes, reviews, and linked block updates', async () => {
    const notebookEvents: NotebookChangedEvent[] = []
    const context = makeContext({
      onNotebooksChanged: (event) => {
        notebookEvents.push(event)
      },
    })

    const block = await context.createBlock('需要在笔记本里持续维护的一条记录。')
    await context.whenIdle()

    const notebook = await context.createNotebook('发布工作台')
    await context.addBlockToNotebook(notebook.id, block.id)
    const notebookWithHeading = await context.createNotebookStructureItem(notebook.id, { type: 'heading', content: '大纲' })
    const heading = notebookWithHeading.items.find((item) => item.type === 'heading')

    if (!heading || heading.type !== 'heading') {
      throw new Error('Expected heading item to exist.')
    }

    await context.updateNotebookStructureItem(notebook.id, heading.id, { content: '正式大纲' })
    await context.updateNotebookReferenceReview(notebook.id, block.id, { pinned: true }, '发布总结')
    await context.updateBlock(block.id, '需要在笔记本里持续维护的一条正式记录。')
    await context.whenIdle()
    await context.removeBlock(block.id)
    await context.removeNotebook(notebook.id)

    expect(notebookEvents).toEqual(expect.arrayContaining([
      { notebookIds: [notebook.id], reason: 'created' },
      { notebookIds: [notebook.id], reason: 'block-linked' },
      { notebookIds: [notebook.id], reason: 'items-changed' },
      { notebookIds: [notebook.id], reason: 'reference-review-updated' },
      { notebookIds: [notebook.id], reason: 'updated' },
      { notebookIds: [notebook.id], reason: 'block-unlinked' },
      { notebookIds: [notebook.id], reason: 'deleted' },
    ]))
  })

  it('persists settings and reports runtime meta', async () => {
    const context = makeContext()
    const config = {
      llm: {
        endpoint: 'https://api.example.com',
        apiKey: 'key-1',
        model: 'gpt-4o-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com',
        apiKey: 'key-2',
        model: 'text-embedding-3-small',
      },
    }

    await context.setSetting(
      'ai_config',
      JSON.stringify(config),
    )
    await context.setSetting(
      'ai_last_test_result',
      JSON.stringify({
        success: true,
        modelsOk: true,
        embeddingOk: true,
        llmOk: true,
        llmStreamingOk: true,
        resolvedBaseUrl: 'https://api.example.com',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 1024,
        chatModel: 'gpt-4o-mini',
        checkedAt: new Date().toISOString(),
        configFingerprint: 'placeholder',
      }),
    )
    await context.setSetting(
      BLOCK_ENRICH_SETTINGS_KEY,
      JSON.stringify({
        queueEnabled: true,
        maxBatchBlocks: 6,
        queueDebounceMs: 1200,
        responseReserveTokens: 2400,
      }),
    )

    expect(await context.getSetting('ai_config')).toContain('api.example.com')
    expect(await context.getSetting(BLOCK_ENRICH_SETTINGS_KEY)).toContain('"maxBatchBlocks":6')

    const meta = await context.getMeta()
    expect(meta.dataDirectory).toContain('changbu-test-')
    expect(typeof meta.vectorReady).toBe('boolean')
    expect(meta.aiConfigured).toBe(true)
    expect(meta.activeAiMode).toBe('mock')
    expect(meta.lastAiTestResult?.success).toBe(true)
    expect(meta.resolvedBaseUrl).toBe('https://api.example.com')
    expect(meta.modelCallCounts).toEqual({ llm: 0, embedding: 0 })
    expect(typeof meta.vectorSchemaReady).toBe('boolean')
  })

  it('emits meta change events for settings, api tests, and doc generation', async () => {
    const originalFetch = global.fetch
    const metaEvents: MetaChangedEvent[] = []
    const context = makeContext({
      onMetaChanged: (event) => {
        metaEvents.push(event)
      },
    })
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    await context.generateDocument('先走一次 mock 文档生成')
    await context.whenIdle()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4o-mini' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.11, 0.12, 0.13, 0.14]]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '测试成功' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ) as typeof global.fetch

    await context.setSetting('ai_config', JSON.stringify(buildLiveConfig()))
    const probe = await context.testApi(buildLiveConfig())

    expect(probe.success).toBe(true)
    expect(metaEvents.map((event) => event.reason)).toEqual(expect.arrayContaining(['doc-generation', 'settings', 'ai-test']))

    global.fetch = originalFetch
  })

  it('switches to live mode after a successful probe for the saved config', async () => {
    const originalFetch = global.fetch
    const context = makeContext()
    const config = {
      llm: {
        endpoint: 'https://api.siliconflow.cn',
        apiKey: 'key-1',
        model: 'Pro/MiniMaxAI/MiniMax-M2.5',
      },
      embedding: {
        endpoint: 'https://api.siliconflow.cn',
        apiKey: 'key-1',
        model: 'BAAI/bge-m3',
      },
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'BAAI/bge-m3' }, { id: 'Pro/MiniMaxAI/MiniMax-M2.5' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        }),
      ) as typeof global.fetch

    const probe = await context.testApi(config)
    expect(probe.success).toBe(true)

    await context.setSetting('ai_config', JSON.stringify(config))
    await context.whenIdle()

    const meta = await context.getMeta()
    expect(meta.activeAiMode).toBe('live')
    expect(meta.vectorDimension).toBe(4)
    expect(meta.lastAiTestResult?.embeddingDimension).toBe(4)

    global.fetch = originalFetch
  })

  it('retries transient live enrich errors before succeeding', async () => {
    const originalFetch = global.fetch
    const events: BlockChangedEvent[] = []
    const context = makeContext({
      onBlockChanged: (event) => {
        events.push(event)
      },
    })
    const config = buildLiveConfig()
    const configFingerprint = createConfigFingerprint(config)
    const makeEmbeddingResponse = () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    const makeLlmResponse = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"categories":["技术"],"detail_tags":["Electron"],"summary":"Electron 记录"}',
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )

    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('请求超时'))
      .mockResolvedValueOnce(makeEmbeddingResponse())
      .mockResolvedValueOnce(makeLlmResponse()) as typeof global.fetch

    await context.setSetting('ai_config', JSON.stringify(config))
    await context.setSetting(
      'ai_last_test_result',
      JSON.stringify({
        success: true,
        modelsOk: true,
        embeddingOk: true,
        llmOk: true,
        llmStreamingOk: true,
        resolvedBaseUrl: 'https://api.example.com',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 4,
        chatModel: 'gpt-4o-mini',
        checkedAt: new Date().toISOString(),
        configFingerprint,
      }),
    )

    const created = await context.createBlock('记录 Electron IPC 重试行为')
    await context.whenIdle()

    const block = await context.getBlock(created.id)
    expect(block.status).toBe('ready')
    expect(block.errorMessage).toBeNull()
    expect(block.summary).toBe('Electron 记录')
    expect(block.tags.map((tag) => tag.name.toLowerCase())).toContain('electron')

    const retryEvent = events.find((event) => event.block.id === created.id && event.block.status === 'pending' && event.block.errorMessage?.includes('自动重试中'))
    expect(retryEvent).toBeDefined()

    const meta = await context.getMeta()
    expect(meta.lastAiError).toBeNull()
    expect(meta.modelCallCounts).toEqual({ llm: 2, embedding: 1 })
    expect(meta.tokenUsage?.requestCount).toBe(3)
    expect(global.fetch).toHaveBeenCalledTimes(3)

    global.fetch = originalFetch
  })

  it('batches live enrich requests when the queue setting is enabled', async () => {
    const originalFetch = global.fetch
    const context = makeContext()

    await configureLiveMode(context)
    await context.setSetting(
      BLOCK_ENRICH_SETTINGS_KEY,
      JSON.stringify({
        queueEnabled: true,
        maxBatchBlocks: 2,
        queueDebounceMs: 3000,
        responseReserveTokens: 1600,
      }),
    )

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as { input?: string[]; messages?: Array<{ content?: string }> } : {}

      if (url.includes('/chat/completions')) {
        const userMessage = body.messages?.find((message) => typeof message.content === 'string' && message.content.includes('块索引'))?.content ?? ''
        expect(userMessage).toContain('块索引：0')
        expect(userMessage).toContain('块索引：1')

        const isReactBatch = userMessage.includes('React 页面结构') || userMessage.includes('第二条：整理 SQLite 查询计划')
        const isElectronBatch = userMessage.includes('第三条：排查 Electron 事件链路') || userMessage.includes('第四条：整理批量队列日志')

        if (isReactBatch) {
          return makeBatchLlmResponse([
            { index: 0, summary: '第一条批量摘要', detailTags: ['React'] },
            { index: 1, summary: '第二条批量摘要', detailTags: ['SQLite'] },
          ])
        }

        if (isElectronBatch) {
          return makeBatchLlmResponse([
            { index: 0, summary: '第三条批量摘要', detailTags: ['Electron'] },
            { index: 1, summary: '第四条批量摘要', detailTags: ['队列'] },
          ])
        }

        throw new Error(`Unexpected batch payload: ${userMessage}`)
      }

      const vectors = (body.input ?? []).map((_, index) => [0.11 + index * 0.01, 0.21, 0.31, 0.41])
      return makeEmbeddingResponse(vectors)
    })

    global.fetch = fetchMock as typeof global.fetch

    const first = await context.createBlock('第一条：补 React 页面结构')
    const second = await context.createBlock('第二条：整理 SQLite 查询计划')
    const third = await context.createBlock('第三条：排查 Electron 事件链路')
    const fourth = await context.createBlock('第四条：整理批量队列日志')
    await context.whenIdle()

    expect((await context.getBlock(first.id)).summary).toBe('第一条批量摘要')
    expect((await context.getBlock(second.id)).summary).toBe('第二条批量摘要')
    expect((await context.getBlock(third.id)).summary).toBe('第三条批量摘要')
    expect((await context.getBlock(fourth.id)).summary).toBe('第四条批量摘要')

    const chatCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/chat/completions'))
    expect(chatCalls).toHaveLength(2)

    global.fetch = originalFetch
  })

  it('does not retry non-transient live enrich errors', async () => {
    const originalFetch = global.fetch
    const context = makeContext()
    const config = buildLiveConfig()
    const configFingerprint = createConfigFingerprint(config)

    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('标签 JSON 解析失败'))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.1, 0.2, 0.3, 0.4]])) as typeof global.fetch

    await context.setSetting('ai_config', JSON.stringify(config))
    await context.setSetting(
      'ai_last_test_result',
      JSON.stringify({
        success: true,
        modelsOk: true,
        embeddingOk: true,
        llmOk: true,
        llmStreamingOk: true,
        resolvedBaseUrl: 'https://api.example.com',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 4,
        chatModel: 'gpt-4o-mini',
        checkedAt: new Date().toISOString(),
        configFingerprint,
      }),
    )

    const created = await context.createBlock('记录不会重试的标签错误')
    await context.whenIdle()

    const block = await context.getBlock(created.id)
    expect(block.status).toBe('error')
    expect(block.errorMessage).toBe('标签 JSON 解析失败')
    expect(global.fetch).toHaveBeenCalledTimes(2)

    const meta = await context.getMeta()
    expect(meta.lastAiError).toBe('标签 JSON 解析失败')

    global.fetch = originalFetch
  })

  it('keeps vector recall available when live enrich fails', async () => {
    const originalFetch = global.fetch
    const context = makeContext()

    await configureLiveMode(context)

    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('标签 JSON 解析失败'))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.41, 0.42, 0.43, 0.44]]))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.41, 0.42, 0.43, 0.44]])) as typeof global.fetch

    const created = await context.createBlock('原文内容与后续查询完全不重合。')
    await context.whenIdle()

    const block = await context.getBlock(created.id)
    expect(block.status).toBe('error')

    const results = await context.searchBlocks('语义召回验证')
    expect(results).toHaveLength(1)
    expect(results[0].block.id).toBe(created.id)
    expect(results[0].matchSource).toEqual(['vector'])

    global.fetch = originalFetch
  })

  it('falls back to text retrieval when live query embeddings fail', async () => {
    const originalFetch = global.fetch
    const context = makeContext()

    await configureLiveMode(context)

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('检索降级摘要', ['技术'], ['Electron']))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.51, 0.52, 0.53, 0.54]])) as typeof global.fetch

    const created = await context.createBlock('Electron 检索降级验证文本')
    await context.whenIdle()

    global.fetch = vi.fn().mockRejectedValueOnce(new Error('query embedding failed')) as typeof global.fetch

    const results = await context.searchBlocks('Electron')
    expect(results.some((item) => item.block.id === created.id)).toBe(true)
    expect(results[0].matchSource).toContain('fts')
    expect(results[0].matchSource).not.toContain('vector')

    const meta = await context.getMeta()
    expect(meta.lastAiError).toBe('query embedding failed')

    global.fetch = originalFetch
  })

  it('does not trigger mock reindex on ai_config save and still rebuilds same-dimension vectors after a successful live probe', async () => {
    const originalFetch = global.fetch
    const context = makeContext()
    const config = buildLiveConfig()
    const vector1536 = new Array(1536).fill(0.01)

    await context.createBlock('等待 live 重建的块。')
    await context.whenIdle()

    const fetchMock = vi.fn()
    global.fetch = fetchMock as typeof global.fetch

    await context.setSetting('ai_config', JSON.stringify(config))
    await context.whenIdle()
    expect(fetchMock).not.toHaveBeenCalled()

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: config.embedding.model }, { id: config.llm.model }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(makeEmbeddingResponse([vector1536]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        }),
      )
      .mockResolvedValueOnce(makeEmbeddingResponse([vector1536]))

    const probe = await context.testApi(config)
    expect(probe.success).toBe(true)
    await context.whenIdle()

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect((await context.getMeta()).activeAiMode).toBe('live')

    global.fetch = originalFetch
  })

  it('ignores enrich results that arrive after the block is deleted', async () => {
    const originalFetch = global.fetch
    const delayedLlm = createDeferredResponse()
    const events: BlockChangedEvent[] = []
    const context = makeContext({
      onBlockChanged: (event) => {
        events.push(event)
      },
    })
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => delayedLlm.promise)
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.11, 0.12, 0.13, 0.14]]))

    global.fetch = fetchMock as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('删除前先挂起 enrich，确认晚到结果不会写回。')
    await waitForCondition(() => fetchMock.mock.calls.length >= 1)

    await context.removeBlock(created.id)
    delayedLlm.resolve(makeLlmResponse('过期摘要', ['技术'], ['过期标签']))
    await context.whenIdle()

    await expect(context.getBlock(created.id)).rejects.toThrow(`Block ${created.id} not found`)
    expect(await context.listBlocks()).toEqual([])
    expect(events.filter((event) => event.block.id === created.id).map((event) => event.reason)).toEqual(['created', 'deleted'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    global.fetch = originalFetch
  })

  it('keeps the latest enrich result when the same block is updated twice quickly', async () => {
    const originalFetch = global.fetch
    const firstLlm = createDeferredResponse()
    const context = makeContext()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstLlm.promise)
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.01, 0.02, 0.03, 0.04]]))
      .mockResolvedValueOnce(makeLlmResponse('第二版摘要', ['技术'], ['Electron']))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.11, 0.12, 0.13, 0.14]]))

    global.fetch = fetchMock as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('第一版内容只提到 React。')
    await waitForCondition(() => fetchMock.mock.calls.length >= 1)

    await context.updateBlock(created.id, '第二版内容改成 Electron IPC。')
    await waitForCondition(async () => (await context.getBlock(created.id)).summary === '第二版摘要')

    firstLlm.resolve(makeLlmResponse('第一版摘要', ['技术'], ['React']))
    await context.whenIdle()

    const block = await context.getBlock(created.id)
    const tagNames = block.tags.map((tag) => tag.name.toLowerCase())

    expect(block.status).toBe('ready')
    expect(block.content).toBe('第二版内容改成 Electron IPC。')
    expect(block.summary).toBe('第二版摘要')
    expect(tagNames).toContain('electron')
    expect(tagNames).not.toContain('react')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)

    global.fetch = originalFetch
  })

  it('does not let an older enrich failure overwrite a newer successful result', async () => {
    const originalFetch = global.fetch
    const firstLlm = createDeferredResponse()
    const context = makeContext()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstLlm.promise)
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.15, 0.16, 0.17, 0.18]]))
      .mockResolvedValueOnce(makeLlmResponse('较新摘要', ['技术'], ['较新标签']))
      .mockResolvedValueOnce(makeEmbeddingResponse([[0.21, 0.22, 0.23, 0.24]]))

    global.fetch = fetchMock as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('旧内容会失败。')
    await waitForCondition(() => fetchMock.mock.calls.length >= 1)

    await context.updateBlock(created.id, '新内容已经成功。')
    await waitForCondition(async () => (await context.getBlock(created.id)).summary === '较新摘要')

    firstLlm.reject(new Error('旧任务失败。'))
    await context.whenIdle()

    const block = await context.getBlock(created.id)

    expect(block.status).toBe('ready')
    expect(block.content).toBe('新内容已经成功。')
    expect(block.summary).toBe('较新摘要')
    expect(block.errorMessage).toBeNull()
    expect(block.tags.map((tag) => tag.name)).toContain('较新标签')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)

    global.fetch = originalFetch
  })

  it('does not mark vector schema as unavailable while queued vector work is still running', async () => {
    const originalFetch = global.fetch
    const firstEmbedding = createDeferredResponse()
    const context = makeContext()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('延迟向量摘要', ['技术'], ['队列']))
      .mockImplementationOnce(() => firstEmbedding.promise)
      .mockImplementation(makeEmbeddingResponder([[0.31, 0.32, 0.33, 0.34]])) as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('先完成标签摘要，再等待后台批量向量化。')
    await waitForCondition(async () => (await context.getBlock(created.id)).status === 'ready')

    const metaDuringQueue = await context.getMeta()
    expect(metaDuringQueue.vectorReady).toBe(true)
    expect(metaDuringQueue.vectorSchemaReady).toBe(true)

    firstEmbedding.resolve(makeEmbeddingResponse([[0.41, 0.42, 0.43, 0.44]]))
    await context.whenIdle()

    const searchResults = await context.searchBlocks('后台批量向量化')
    expect(searchResults.some((item) => item.block.id === created.id)).toBe(true)

    global.fetch = originalFetch
  })

  it('removes stale vectors immediately after block updates and restores them after batched reindex', async () => {
    const originalFetch = global.fetch
    const firstEmbedding = createDeferredResponse()
    const secondEmbedding = createDeferredResponse()
    const context = makeContext()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('首次摘要', ['技术'], ['React']))
      .mockImplementationOnce(() => firstEmbedding.promise)
      .mockResolvedValueOnce(makeLlmResponse('更新后摘要', ['技术'], ['Electron']))
      .mockImplementationOnce(() => secondEmbedding.promise)
      .mockImplementation(makeEmbeddingResponder([[0.81, 0.82, 0.83, 0.84]])) as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('第一版内容只提到 React。')
    await waitForCondition(async () => (await context.getBlock(created.id)).status === 'ready')

    firstEmbedding.resolve(makeEmbeddingResponse([[0.1, 0.2, 0.3, 0.4]]))
    await context.whenIdle()

    await context.updateBlock(created.id, '第二版内容改成 Electron IPC 方案。')
    await waitForCondition(async () => (await context.getBlock(created.id)).status === 'ready')

    const beforeSecondEmbedding = await context.searchBlocks('Electron IPC 方案')
    expect(beforeSecondEmbedding.some((item) => item.block.id === created.id)).toBe(true)
    expect(beforeSecondEmbedding.find((item) => item.block.id === created.id)?.matchSource).not.toContain('vector')

    secondEmbedding.resolve(makeEmbeddingResponse([[0.5, 0.6, 0.7, 0.8]]))
    await context.whenIdle()

    const afterSecondEmbedding = await context.searchBlocks('Electron IPC 方案')
    expect(afterSecondEmbedding.some((item) => item.block.id === created.id && item.matchSource.includes('vector'))).toBe(true)

    global.fetch = originalFetch
  })

  it('drains newly queued blocks in the same reindex run', async () => {
    const originalFetch = global.fetch
    const firstBatch = createDeferredResponse()
    const context = makeContext()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('第一条摘要', ['技术'], ['A']))
      .mockImplementationOnce(() => firstBatch.promise)
      .mockResolvedValueOnce(makeLlmResponse('第二条摘要', ['技术'], ['B']))
      .mockImplementation(makeEmbeddingResponder([[0.51, 0.52, 0.53, 0.54]])) as typeof global.fetch

    await configureLiveMode(context)

    const first = await context.createBlock('第一条记录：用于占住第一轮向量批处理。')
    await waitForCondition(async () => (await context.getBlock(first.id)).status === 'ready')

    const second = await context.createBlock('第二条记录：在第一轮向量处理中途加入队列。')
    await waitForCondition(async () => (await context.getBlock(second.id)).status === 'ready')

    firstBatch.resolve(makeEmbeddingResponse([[0.21, 0.22, 0.23, 0.24]]))
    await context.whenIdle()

    const secondResults = await context.searchBlocks('中途加入队列')
    expect(secondResults.some((item) => item.block.id === second.id && item.matchSource.includes('vector'))).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(5)

    global.fetch = originalFetch
  })

  it('queues imported markdown blocks for one batched vector reindex after enrich completes', async () => {
    const originalFetch = global.fetch
    const { context, directory } = makeContextWithDirectory()
    const markdownPath = join(directory, 'import.md')
    writeFileSync(markdownPath, '# 批量导入\n\n需要统一走后台向量补齐。', 'utf8')

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('导入摘要', ['技术'], ['导入']))
      .mockImplementation(makeEmbeddingResponder([[0.31, 0.32, 0.33, 0.34]])) as typeof global.fetch

    await configureLiveMode(context)

    const preview = await context.previewImportMarkdown([markdownPath])
    expect(preview?.totalBlocks).toBe(1)

    const imported = await context.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(1)
    await context.whenIdle()

    const blocks = await context.listBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].status).toBe('ready')

    const results = await context.searchBlocks('后台向量补齐')
    expect(results.some((item) => item.block.id === blocks[0].id && item.matchSource.includes('vector'))).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(3)

    global.fetch = originalFetch
  })

  it('does not import markdown attachments from outside the selected file directory', async () => {
    const { context, directory } = makeContextWithDirectory()
    const bundleDirectory = join(directory, 'markdown-import')
    const markdownPath = join(bundleDirectory, 'import.md')
    const outsideAttachmentPath = join(directory, 'outside.png')

    mkdirSync(bundleDirectory, { recursive: true })
    writeFileSync(outsideAttachmentPath, Buffer.from(ONE_PIXEL_PNG_DATA_URL.split(',')[1], 'base64'))
    writeFileSync(markdownPath, '导入内容\n\n![外部图片](../outside.png)', 'utf8')

    const preview = await context.previewImportMarkdown([markdownPath])
    expect(preview?.totalBlocks).toBe(1)

    const imported = await context.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(1)

    const blocks = await context.listBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toContain('![外部图片](../outside.png)')

    const db = openDb(directory)
    const attachmentCount = db.prepare('SELECT COUNT(*) AS total FROM attachments').get() as { total: number }
    db.close()

    expect(attachmentCount.total).toBe(0)
    expect(existsSync(outsideAttachmentPath)).toBe(true)
  })

  it('does not leave partial data behind when import confirmation fails', async () => {
    const { context, directory } = makeContextWithDirectory()
    const importPath = join(directory, 'broken-import.json')

    writeFileSync(
      importPath,
      JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        blocks: [
          {
            id: 'block-valid',
            content: '第一条本应成功的导入块。',
            summary: null,
            createdAt: '2026-04-01T09:00:00.000Z',
            updatedAt: '2026-04-01T09:00:00.000Z',
            status: 'ready',
            aiMode: 'mock',
            errorMessage: null,
            tags: [],
            attachments: [],
          },
          {
            id: 'block-invalid',
            content: '第二条会触发失败的导入块。',
            summary: null,
            createdAt: '2026-04-01T10:00:00.000Z',
            updatedAt: '2026-04-01T10:00:00.000Z',
            status: 'ready',
            aiMode: 'mock',
            errorMessage: null,
            tags: [],
            attachments: [
              {
                sourceUrl: 'file:///tmp/invalid.txt',
                filename: 'invalid.txt',
                mimeType: 'text/plain',
                altText: null,
                base64: Buffer.from('invalid').toString('base64'),
              },
            ],
          },
        ],
      }, null, 2),
      'utf8',
    )

    const preview = await context.previewImportJson(importPath)
    expect(preview?.totalBlocks).toBe(2)

    await expect(context.confirmImport(preview!.importId, 'overwrite_all')).rejects.toThrow('不支持的图片数据格式。')

    const db = openDb(directory)
    const blockCount = db.prepare('SELECT COUNT(*) AS total FROM blocks').get() as { total: number }
    const attachmentCount = db.prepare('SELECT COUNT(*) AS total FROM attachments').get() as { total: number }
    db.close()

    expect(blockCount.total).toBe(0)
    expect(attachmentCount.total).toBe(0)
  })

  it('preserves notebook relations while replacing tags and attachments on json overwrite import', async () => {
    const { context, directory } = makeContextWithDirectory()
    const savedImage = await context.saveImage(ONE_PIXEL_PNG_DATA_URL, 'before.png')
    const block = await context.createBlock(`导入前的原始内容。\n\n![原图](${savedImage.fileUrl})`)
    await context.whenIdle()
    await context.addTag(block.id, '旧标签')

    const notebook = await context.createNotebook('导入工作台')
    await context.addBlockToNotebook(notebook.id, block.id)
    await context.updateNotebookReferenceReview(notebook.id, block.id, { pinned: true, locked: true }, '导入检查')

    const overwritePath = join(directory, 'overwrite.json')
    writeFileSync(
      overwritePath,
      JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        blocks: [
          {
            id: block.id,
            content: '导入后的新内容，不再引用任何图片。',
            summary: '导入后的摘要',
            createdAt: block.createdAt,
            updatedAt: new Date().toISOString(),
            status: 'error',
            aiMode: 'live',
            errorMessage: '导入后的错误信息',
            tags: [
              { name: '新标签', source: 'manual', kind: 'user' },
            ],
            attachments: [],
          },
        ],
      }, null, 2),
      'utf8',
    )

    const preview = await context.previewImportJson(overwritePath)
    expect(preview?.conflicts).toBe(1)

    const imported = await context.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(1)

    const importedBlock = await context.getBlock(block.id)
    expect(importedBlock.content).toBe('导入后的新内容，不再引用任何图片。')
    expect(importedBlock.summary).toBe('导入后的摘要')
    expect(importedBlock.status).toBe('error')
    expect(importedBlock.aiMode).toBe('live')
    expect(importedBlock.errorMessage).toBe('导入后的错误信息')
    expect(importedBlock.tags.map((tag) => tag.name)).toEqual(['新标签'])

    const notebookAfterImport = await context.getNotebook(notebook.id)
    expect(notebookAfterImport.items.filter((item) => item.type === 'block').map((item) => item.blockId)).toContain(block.id)

    const previewAfterImport = await context.getNotebookReferencePreview(notebook.id, '导入检查')
    const importedCandidate = previewAfterImport.candidates.find((candidate) => candidate.block.id === block.id)
    expect(importedCandidate?.review).toMatchObject({
      pinned: true,
      locked: true,
      excluded: false,
    })

    const db = openDb(directory)
    const notebookLinks = db.prepare('SELECT COUNT(*) AS total FROM notebook_items WHERE notebook_id = ? AND block_id = ?').get(notebook.id, block.id) as { total: number }
    const reviewLinks = db.prepare('SELECT COUNT(*) AS total FROM notebook_reference_reviews WHERE notebook_id = ? AND block_id = ?').get(notebook.id, block.id) as { total: number }
    const attachmentLinks = db.prepare('SELECT COUNT(*) AS total FROM block_attachments WHERE block_id = ?').get(block.id) as { total: number }
    db.close()

    expect(notebookLinks.total).toBe(1)
    expect(reviewLinks.total).toBe(1)
    expect(attachmentLinks.total).toBe(0)
  })

  it('cleans pending vector jobs when a block is deleted', async () => {
    const originalFetch = global.fetch
    const deferredEmbedding = createDeferredResponse()
    const { context, directory } = makeContextWithDirectory()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeLlmResponse('删除前摘要', ['技术'], ['删除']))
      .mockImplementationOnce(() => deferredEmbedding.promise)

    global.fetch = fetchMock as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('删除前先进入待补向量队列。')
    await waitForCondition(async () => (await context.getBlock(created.id)).status === 'ready')

    const db = openDb(directory)
    const pendingBeforeDelete = db.prepare('SELECT COUNT(*) AS total FROM pending_block_vectors WHERE block_id = ?').get(created.id) as { total: number }
    expect(pendingBeforeDelete.total).toBe(1)
    db.close()

    await context.removeBlock(created.id)

    const reopened = openDb(directory)
    const pendingAfterDelete = reopened.prepare('SELECT COUNT(*) AS total FROM pending_block_vectors WHERE block_id = ?').get(created.id) as { total: number }
    reopened.close()
    expect(pendingAfterDelete.total).toBe(0)

    deferredEmbedding.resolve(makeEmbeddingResponse([[0.61, 0.62, 0.63, 0.64]]))
    await context.whenIdle()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    global.fetch = originalFetch
  })

  it('emits meta change events when failed vectors are retried', async () => {
    const metaEvents: MetaChangedEvent[] = []
    const { context, directory } = makeContextWithDirectory({
      onMetaChanged: (event) => {
        metaEvents.push(event)
      },
    })

    const db = openDb(directory)
    db.prepare(
      `
        INSERT INTO blocks (id, content, status, ai_mode, created_at, updated_at)
        VALUES (?, ?, 'ready', 'mock', ?, ?)
      `,
    ).run('block-retry-1', '需要重试的块。', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z')
    db.prepare(
      `
        INSERT INTO failed_block_vectors (block_id, content, error_message, failed_at)
        VALUES (?, ?, ?, ?)
      `,
    ).run('block-retry-1', '需要重试的块。', 'embedding unavailable', '2026-04-01T09:00:00.000Z')
    db.close()

    const retried = await context.retryFailedVectors()
    await context.whenIdle()

    expect(retried).toBe(1)
    expect(metaEvents.map((event) => event.reason)).toContain('vector-retry')
  })

  it('returns null when import or export pickers are cancelled', async () => {
    const context = makeContext({
      chooseDirectory: async () => null,
      chooseSavePath: async () => null,
      chooseOpenPaths: async () => [],
    })

    expect(await context.exportMarkdown({ includeAttachments: true })).toBeNull()
    expect(await context.exportJson({ includeAttachments: true })).toBeNull()
    expect(await context.previewImportMarkdown()).toBeNull()
    expect(await context.previewImportJson()).toBeNull()
  })

  it('limits generated document references based on doc generation settings', async () => {
    const context = makeContext()

    await context.createBlock('PRD 需要覆盖登录流程和权限边界')
    await context.createBlock('PRD 还要补充发布节奏与回滚方案')
    await context.createBlock('PRD 最后需要明确埋点和验收标准')
    await context.whenIdle()

    await context.setSetting(
      DOC_GENERATION_SETTINGS_KEY,
      JSON.stringify({
        maxReferenceBlocks: 2,
      }),
    )

    const started = await context.generateDocument('PRD')

    expect(started.blockIds).toHaveLength(2)
    await context.whenIdle()
  })

  it('supports saving snapshots with zero referenced blocks', async () => {
    const context = makeContext()

    const snapshot = await context.saveSnapshot('信息不足主题', '# 信息不足\n\n当前没有足够相关块。', [])

    expect(snapshot.blockIds).toEqual([])
    expect((await context.getSnapshot(snapshot.id)).blockIds).toEqual([])
  })

  it('supports notebook reference review, notebook generation, and notebook-bound snapshots', async () => {
    const chunks: DocGenerationChunk[] = []
    const context = makeContext({
      onDocGenerationChunk: (chunk) => {
        chunks.push(chunk)
      },
    })

    await context.setSetting(
      DOC_GENERATION_SETTINGS_KEY,
      JSON.stringify({
        maxReferenceBlocks: 2,
      }),
    )

    const first = await context.createBlock('发布说明里需要明确上线范围和回滚方案。')
    const second = await context.createBlock('发布总结要补充监控指标和验收结果。')
    const third = await context.createBlock('补一段偏离主题的杂项记录。')
    await context.whenIdle()

    const notebook = await context.createNotebook('发布工作台')
    await context.addBlockToNotebook(notebook.id, first.id)
    await context.addBlockToNotebook(notebook.id, second.id)
    await context.addBlockToNotebook(notebook.id, third.id)
    await context.createNotebookStructureItem(notebook.id, { type: 'heading', content: '发布总结' })
    await context.createNotebookStructureItem(notebook.id, { type: 'todo', content: '补充验收项' })

    const initialPreview = await context.getNotebookReferencePreview(notebook.id, '发布总结')
    expect(initialPreview.candidates).toHaveLength(3)

    const pinnedPreview = await context.updateNotebookReferenceReview(notebook.id, third.id, { pinned: true }, '发布总结')
    expect(pinnedPreview.candidates.find((candidate) => candidate.block.id === third.id)?.selectionReason).toBe('pinned')

    const excludedPreview = await context.updateNotebookReferenceReview(notebook.id, second.id, { excluded: true }, '发布总结')
    expect(excludedPreview.candidates.find((candidate) => candidate.block.id === second.id)?.selected).toBe(false)

    const started = await context.generateNotebookDocument(notebook.id, '发布总结')
    expect(started.notebookId).toBe(notebook.id)
    expect(started.blockIds.length).toBeLessThanOrEqual(2)

    await context.whenIdle()
    expect(chunks.at(-1)?.done).toBe(true)

    const snapshot = await context.saveSnapshot('发布总结', '# 发布总结', started.blockIds, notebook.id)
    expect(snapshot.notebookId).toBe(notebook.id)
    expect((await context.listSnapshots('', notebook.id))).toHaveLength(1)
    expect((await context.getSnapshot(snapshot.id)).notebookTitle).toBe('发布工作台')
  })

  it('extracts calendar suggestions from dated blocks and supports accepting them', async () => {
    const originalFetch = global.fetch
    const context = makeContext()

    global.fetch = vi.fn(async (input, init) => {
      const url = String(input)

      if (url.endsWith('/embeddings')) {
        return makeEmbeddingResponse([[0.11, 0.12, 0.13, 0.14]])
      }

      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages?: Array<{ content?: string }>
        }
        const systemPrompt = body.messages?.[0]?.content ?? ''

        if (typeof systemPrompt === 'string' && systemPrompt.includes('日历计划提取助手')) {
          return makeCalendarSuggestionResponse([
            {
              title: '和设计师过一遍首屏',
              date: '2026-04-10',
              startTime: '10:30',
              allDay: false,
              notes: '重点确认排版和动效',
              evidenceText: '4月10日上午10:30和设计师过一遍首屏',
              confidence: 0.93,
            },
            {
              title: '提交最终文案',
              date: '2026-04-12',
              allDay: true,
              notes: '把首页文案整理后发出',
              evidenceText: '4月12日提交最终文案',
              confidence: 0.88,
            },
          ])
        }

        return makeLlmResponse('排期记录', ['工作'], ['排期'])
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    }) as typeof global.fetch

    await configureLiveMode(context)

    const created = await context.createBlock('4月10日上午10:30和设计师过一遍首屏，再在4月12日提交最终文案。')
    await context.whenIdle()

    const createdDay = formatLocalDate(created.createdAt)
    const createdDayDetail = await context.getCalendarDayDetail(createdDay)
    expect(createdDayDetail.blockCount).toBe(1)
    expect(createdDayDetail.blocks[0]?.id).toBe(created.id)

    const suggestionDay = await context.getCalendarDayDetail('2026-04-10')
    expect(suggestionDay.suggestions).toHaveLength(1)
    expect(suggestionDay.suggestions[0]).toMatchObject({
      title: '和设计师过一遍首屏',
      startTime: '10:30',
      allDay: false,
      sourceBlockId: created.id,
    })

    const secondSuggestionDay = await context.getCalendarDayDetail('2026-04-12')
    expect(secondSuggestionDay.suggestions).toHaveLength(1)
    const accepted = await context.acceptCalendarSuggestion(secondSuggestionDay.suggestions[0].id, {
      title: '提交首页最终文案',
    })

    expect(accepted).toMatchObject({
      title: '提交首页最终文案',
      source: 'ai-accepted',
      linkedBlockId: created.id,
    })

    const upcoming = await context.listUpcomingCalendarEntries(14)
    expect(upcoming.some((entry) => entry.title === '提交首页最终文案')).toBe(true)

    const years = await context.listCalendarYears()
    expect(years).toContain(2026)

    global.fetch = originalFetch
  })
})
