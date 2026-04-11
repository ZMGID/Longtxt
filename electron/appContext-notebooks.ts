/**
 * Notebook CRUD 与文档生成模块
 *
 * 提供 notebook 增删改查、引用预览、结构条目管理、
 * 以及文档生成（独立和 notebook 级）等公共方法。
 */

import { v4 as uuid } from 'uuid'

import type {
  AIExecutionMode,
  AppLanguage,
  Block,
  Notebook,
  NotebookReferencePreview,
} from '../shared/types'
import { searchBlocks as searchBlocksInDatabase } from './db/search'
import { createBlockRecord } from './db/blocks'
import {
  addBlockToNotebook,
  appendBlockToNotebook,
  createNotebookRecord,
  createNotebookStructureItem as createNotebookStructureItemInDb,
  deleteNotebookRecord,
  ensureNotebookExists,
  getNotebookById,
  listNotebookBlockEntries,
  listNotebooks as listNotebooksInDb,
  listNotebookReferenceReviews,
  removeItemFromNotebook,
  reorderNotebookItems,
  updateNotebookReferenceReview as updateNotebookReferenceReviewInDb,
  updateNotebookStructureItem as updateNotebookStructureItemInDb,
  updateNotebookTitle,
} from './db/notebooks'
import { removeFailedBlockVector } from './db/vectors'
import { syncBlockAttachmentRecords } from './services/attachments'
import { selectDocumentReferenceBlocks, selectDocumentReferenceResults } from './services/docgen'
import { validateBlockContent, normalizeNotebookTitle, normalizeNotebookTopic, buildNotebookWritingGuide } from './appContext-utils'
import { startStreamedDocumentGenerationTask } from './appContext-docgen'
import type { AppContextOptions } from './appContext-types'
import type { EmbeddingProvider, LLMProvider } from './services/ai'

export interface NotebookDeps {
  db: import('better-sqlite3').Database
  options: AppContextOptions
  emitNotebooksChanged: (event: import('../shared/types').NotebookChangedEvent) => void
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  emitDocGenerationChunk: (chunk: import('../shared/types').DocGenerationChunk) => void
  emitBlockChangedWithDerivedInvalidation: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  getProviders: () => { mode: AIExecutionMode; embeddingProvider: EmbeddingProvider; llmProvider: LLMProvider }
  getQueryEmbedding: (query: string, mode: AIExecutionMode, provider: EmbeddingProvider) => Promise<number[] | null>
  canUseVectorSearch: () => boolean
  getDocGenerationSettings: () => { maxReferenceBlocks: number; retrievalLimit: number; temperature: number; maxOutputTokens: number }
  clearRuntimeAiError: () => boolean
  rememberRuntimeAiError: (error: unknown) => void
  validateContent: (content: string) => string
  getExecutionMode: () => AIExecutionMode
  getUiSettings: () => { language: AppLanguage }
  clearDailyReviewCache: () => void
  scheduleEnrich: (blockId: string, content: string, generation: number) => void
  advanceBlockEnrichGeneration: (blockId: string) => number
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<Block, 'id' | 'updatedAt'>>) => void
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  buildInitialBlockState: (content: string, aiMode: AIExecutionMode) => { status: Block['status']; aiMode: AIExecutionMode; errorCode: Block['errorCode']; errorMessage: Block['errorMessage']; shouldProcess: boolean }
}

export interface NotebookModule {
  listNotebooks: () => Promise<import('../shared/types').NotebookSummary[]>
  getNotebook: (id: string) => Promise<Notebook>
  createNotebook: (title?: string) => Promise<Notebook>
  updateNotebook: (id: string, title: string) => Promise<Notebook>
  removeNotebook: (id: string) => Promise<void>
  addBlockToNotebook: (notebookId: string, blockId: string) => Promise<import('../shared/types').NotebookMutationResult>
  removeNotebookItem: (notebookId: string, itemId: string) => Promise<Notebook>
  reorderNotebookItems: (notebookId: string, itemIds: string[]) => Promise<Notebook>
  createNotebookBlock: (notebookId: string, content: string) => Promise<Notebook>
  createNotebookStructureItem: (notebookId: string, input: import('../shared/types').NotebookStructureItemInput) => Promise<Notebook>
  updateNotebookStructureItem: (notebookId: string, itemId: string, patch: import('../shared/types').NotebookStructureItemPatch) => Promise<Notebook>
  getNotebookReferencePreview: (notebookId: string, topic?: string) => Promise<NotebookReferencePreview>
  updateNotebookReferenceReview: (
    notebookId: string,
    blockId: string,
    patch: Partial<Pick<import('../shared/types').NotebookReferenceReviewState, 'excluded' | 'locked' | 'pinned'>>,
    topic?: string,
  ) => Promise<NotebookReferencePreview>
  generateNotebookDocument: (notebookId: string, topic?: string) => Promise<import('../shared/types').DocGenerationStart>
  generateDocument: (topic: string) => Promise<import('../shared/types').DocGenerationStart>
}

export function createNotebookModule(deps: NotebookDeps): NotebookModule {
  const {
    db,
    options,
    emitNotebooksChanged,
    emitMetaChanged,
    emitDocGenerationChunk,
    emitBlockChangedWithDerivedInvalidation,
    trackTask,
    getProviders,
    getQueryEmbedding,
    canUseVectorSearch,
    getDocGenerationSettings,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    validateContent,
    getExecutionMode,
    getUiSettings,
    clearDailyReviewCache,
    scheduleEnrich,
    advanceBlockEnrichGeneration,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    buildInitialBlockState,
  } = deps

  /** 构建引用预览：检索 notebook 内块的搜索结果，根据配置筛选参考块 */
  async function buildNotebookReferencePreview(
    notebook: Notebook,
    topic: string,
    providerState?: {
      mode: AIExecutionMode
      embeddingProvider: EmbeddingProvider
    },
  ): Promise<NotebookReferencePreview> {
    const { maxReferenceBlocks, retrievalLimit } = getDocGenerationSettings()
    const blockEntries = listNotebookBlockEntries(db, notebook.id)

    if (blockEntries.length === 0) {
      return {
        notebookId: notebook.id,
        topic,
        maxReferenceBlocks,
        candidateCount: 0,
        selectedCount: 0,
        candidates: [],
      }
    }

    const providers = providerState ?? getProviders()
    const queryEmbedding = await getQueryEmbedding(topic, providers.mode, providers.embeddingProvider)
    const results = searchBlocksInDatabase(db, topic, {
      limit: Math.max(blockEntries.length, maxReferenceBlocks * 2, retrievalLimit),
      queryEmbedding,
      vectorEnabled: canUseVectorSearch() && Boolean(queryEmbedding),
      allowedBlockIds: blockEntries.map((entry) => entry.blockId),
    })
    const resultMap = new Map(results.map((result) => [result.block.id, result]))
    const reviewMap = new Map(listNotebookReferenceReviews(db, notebook.id).map((item) => [item.blockId, item]))

    const orderedInputs = blockEntries.map((entry) => {
      const result = resultMap.get(entry.blockId) ?? {
        block: entry.block,
        score: 0,
        matchSource: [],
      }

      return {
        notebookItemId: entry.itemId,
        result,
        review: reviewMap.get(entry.blockId) ?? {
          blockId: entry.blockId,
          excluded: false,
          locked: false,
          pinned: false,
          updatedAt: null,
        },
      }
    })

    const selectedResults = selectDocumentReferenceResults(
      orderedInputs.map((entry) => ({
        result: entry.result,
        flags: entry.review,
      })),
      maxReferenceBlocks,
    )
    const selectedMap = new Map(selectedResults.map((item) => [item.result.block.id, item.reason]))

    return {
      notebookId: notebook.id,
      topic,
      maxReferenceBlocks,
      candidateCount: orderedInputs.length,
      selectedCount: selectedResults.length,
      candidates: orderedInputs.map((entry) => ({
        ...entry.result,
        notebookItemId: entry.notebookItemId,
        selected: selectedMap.has(entry.result.block.id),
        selectionReason: selectedMap.get(entry.result.block.id) ?? 'not-selected',
        review: entry.review,
      })),
    }
  }

  return {
    async listNotebooks() {
      return listNotebooksInDb(db)
    },

    async getNotebook(id) {
      return getNotebookById(db, id)
    },

    async createNotebook(title) {
      const now = new Date().toISOString()
      const notebook = createNotebookRecord(db, {
        id: uuid(),
        title: normalizeNotebookTitle(title),
        createdAt: now,
        updatedAt: now,
      })
      emitNotebooksChanged({
        notebookIds: [notebook.id],
        reason: 'created',
      })
      return notebook
    },

    async updateNotebook(id, title) {
      const notebook = updateNotebookTitle(db, id, normalizeNotebookTitle(title), new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [id],
        reason: 'updated',
      })
      return notebook
    },

    async removeNotebook(id) {
      deleteNotebookRecord(db, id)
      emitNotebooksChanged({
        notebookIds: [id],
        reason: 'deleted',
      })
    },

    async addBlockToNotebook(notebookId, blockId) {
      const result = addBlockToNotebook(db, notebookId, blockId, new Date().toISOString())

      if (result.added) {
        emitNotebooksChanged({
          notebookIds: [notebookId],
          reason: 'block-linked',
        })
      }

      return result
    },

    async removeNotebookItem(notebookId, itemId) {
      const notebook = removeItemFromNotebook(db, notebookId, itemId, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })
      return notebook
    },

    async reorderNotebookItems(notebookId, itemIds) {
      const notebook = reorderNotebookItems(db, notebookId, itemIds, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })
      return notebook
    },

    async createNotebookBlock(notebookId, content) {
      const safeContent = validateBlockContent(content, getUiSettings().language)
      const now = new Date().toISOString()
      const aiMode = getExecutionMode()
      const initialState = buildInitialBlockState(safeContent, aiMode)
      const transaction = db.transaction(() => {
        ensureNotebookExists(db, notebookId)

        const block = createBlockRecord(db, {
          id: uuid(),
          content: safeContent,
          status: initialState.status,
          aiMode: initialState.aiMode,
          errorCode: initialState.errorCode,
          errorMessage: initialState.errorMessage,
          createdAt: now,
          updatedAt: now,
        })

        appendBlockToNotebook(db, notebookId, block.id, now)
        syncBlockAttachmentRecords(db, options.dataDirectory, block.id, safeContent)
        removeFailedBlockVector(db, block.id)
        return block
      })

      const block = transaction()
      const enrichGeneration = advanceBlockEnrichGeneration(block.id)
      clearDailyReviewCache()

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'created',
      })
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })

      if (initialState.shouldProcess) {
        scheduleEnrich(block.id, safeContent, enrichGeneration)
        enqueueBlocksForVectorReindex([block])
        scheduleCurrentVectorReindex()
      }

      return getNotebookById(db, notebookId)
    },

    async createNotebookStructureItem(notebookId, input) {
      const notebook = createNotebookStructureItemInDb(db, notebookId, input, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })
      return notebook
    },

    async updateNotebookStructureItem(notebookId, itemId, patch) {
      const notebook = updateNotebookStructureItemInDb(db, notebookId, itemId, patch, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })
      return notebook
    },

    async getNotebookReferencePreview(notebookId, topic) {
      const notebook = getNotebookById(db, notebookId)
      const safeTopic = validateContent(normalizeNotebookTopic(notebook, topic))
      return buildNotebookReferencePreview(notebook, safeTopic)
    },

    async updateNotebookReferenceReview(notebookId, blockId, patch, topic) {
      updateNotebookReferenceReviewInDb(db, notebookId, blockId, patch, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'reference-review-updated',
      })
      const notebook = getNotebookById(db, notebookId)
      const safeTopic = validateContent(normalizeNotebookTopic(notebook, topic))
      return buildNotebookReferencePreview(notebook, safeTopic)
    },

    async generateNotebookDocument(notebookId, topic) {
      const notebook = getNotebookById(db, notebookId)
      const safeTopic = validateContent(normalizeNotebookTopic(notebook, topic))
      const requestId = uuid()
      const { mode, embeddingProvider, llmProvider } = getProviders()
      const { temperature, maxOutputTokens } = getDocGenerationSettings()
      const preview = await buildNotebookReferencePreview(notebook, safeTopic, {
        mode,
        embeddingProvider,
      })
      const selectedBlocks = preview.candidates
        .filter((candidate) => candidate.selected)
        .map((candidate) => candidate.block)

      // 构建写作指南：从 notebook items 中提取 heading 和 note 作为写作参考
      const writingGuide = buildNotebookWritingGuide(notebook.items)

      void trackTask(
        startStreamedDocumentGenerationTask({
          requestId,
          topic: safeTopic,
          blocks: selectedBlocks,
          llmProvider,
          mode,
          temperature,
          maxOutputTokens,
          writingGuide,
          onChunk: emitDocGenerationChunk,
          onLiveDelta: clearRuntimeAiError,
          onError: (error) => {
            if (mode === 'live') {
              rememberRuntimeAiError(error)
            }
          },
          onSettled: () => {
            emitMetaChanged({
              reason: 'doc-generation',
            })
          },
        }),
      )

      return {
        requestId,
        topic: safeTopic,
        mode,
        blockIds: selectedBlocks.map((block) => block.id),
        notebookId,
      }
    },

    async generateDocument(topic) {
      const safeTopic = validateContent(topic)
      const requestId = uuid()
      const { mode, embeddingProvider, llmProvider } = getProviders()
      const { maxReferenceBlocks, retrievalLimit, temperature, maxOutputTokens } = getDocGenerationSettings()
      const queryEmbedding = await getQueryEmbedding(safeTopic, mode, embeddingProvider)

      const results = searchBlocksInDatabase(db, safeTopic, {
        limit: retrievalLimit,
        queryEmbedding,
        vectorEnabled: canUseVectorSearch() && Boolean(queryEmbedding),
      })
      const blocks = selectDocumentReferenceBlocks(results, maxReferenceBlocks)

      void trackTask(
        startStreamedDocumentGenerationTask({
          requestId,
          topic: safeTopic,
          blocks,
          llmProvider,
          mode,
          temperature,
          maxOutputTokens,
          onChunk: emitDocGenerationChunk,
          onLiveDelta: clearRuntimeAiError,
          onError: (error) => {
            if (mode === 'live') {
              rememberRuntimeAiError(error)
            }
          },
          onSettled: () => {
            emitMetaChanged({
              reason: 'doc-generation',
            })
          },
        }),
      )

      return {
        requestId,
        topic: safeTopic,
        mode,
        blockIds: blocks.map((block) => block.id),
      }
    },
  }
}
