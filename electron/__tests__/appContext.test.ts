// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DOC_GENERATION_SETTINGS_KEY } from '../../shared/config'
import type { DocGenerationChunk } from '../../shared/types'
import { createAppContext, type AppContext, type AppContextOptions } from '../appContext'

const createdContexts: AppContext[] = []
const createdDirectories: string[] = []

function makeContext(options: Partial<AppContextOptions> = {}): AppContext {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-test-'))
  createdDirectories.push(directory)

  const context = createAppContext({
    dataDirectory: directory,
    openPath: async () => '',
    ...options,
  })

  createdContexts.push(context)
  return context
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
    if (meta.vectorReady) {
      expect(searchResults[0].matchSource).toContain('vector')
    }

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

    expect(await context.getSetting('ai_config')).toContain('api.example.com')

    const meta = await context.getMeta()
    expect(meta.dataDirectory).toContain('changbu-test-')
    expect(typeof meta.vectorReady).toBe('boolean')
    expect(meta.aiConfigured).toBe(true)
    expect(meta.activeAiMode).toBe('mock')
    expect(meta.lastAiTestResult?.success).toBe(true)
    expect(meta.resolvedBaseUrl).toBe('https://api.example.com')
    expect(typeof meta.vectorSchemaReady).toBe('boolean')
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
})
