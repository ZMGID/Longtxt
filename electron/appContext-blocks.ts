/**
 * 块 CRUD 操作模块
 *
 * 提供块的创建、更新、删除以及标签、附件等公共方法。
 */

import { v4 as uuid } from 'uuid'

import { DEFAULT_PAGE_SIZE } from '../shared/config'
import type { AIExecutionMode, AppLanguage, Block, BlockListPage, RelatedBlockResult, TagSuggestion, BlockListCursor } from '../shared/types'
import {
  addManualTagToBlock,
  clearAutoBlockTags,
  createBlockRecord,
  deleteBlockRecord,
  getBlockById,
  getBlockContextWindow,
  getBlocksByIds,
  listBlocks as listBlocksInDb,
  listBlocksByDate as listBlocksByDateInDb,
  removeTagFromBlock,
  updateBlockContent,
  updateBlockState,
} from './db/blocks'
import { findRelatedBlockIds } from './db/connections'
import { clearCalendarSuggestionsForBlock } from './db/calendar'
import { touchNotebooksForBlock } from './db/notebooks'
import {
  deleteBlockVector,
  removeFailedBlockVector,
  removePendingBlockVectors,
} from './db/vectors'
import { getOrCreateTag, listAvailableTags } from './db/tags'
import { saveImageDataUrl, syncBlockAttachmentRecords } from './services/attachments'
import { validateBlockContent } from './appContext-utils'
import type { AppContextOptions, QueuedEnrichRequest } from './appContext-types'

export interface BlockDeps {
  db: import('better-sqlite3').Database
  options: AppContextOptions
  vectorReady: boolean
  emitBlockChangedWithDerivedInvalidation: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  emitTouchedNotebooks: (ids: string[], reason: string) => void
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  getExecutionMode: () => AIExecutionMode
  getUiSettings: () => { language: AppLanguage }
  clearDailyReviewCache: () => void
  /** 调度块富化任务 */
  scheduleEnrich: (blockId: string, content: string, generation: number) => void
  /** 递增并返回块的富化代数 */
  advanceBlockEnrichGeneration: (blockId: string) => number
  /** 判断块内容是否应进入后台处理 */
  getBlockProcessingDecision: (content: string) => { shouldProcess: boolean; errorCode: string | null; errorMessage: string | null }
  /** 根据内容与 AI 模式构建初始块状态 */
  buildInitialBlockState: (content: string, aiMode: AIExecutionMode) => { status: Block['status']; aiMode: AIExecutionMode; errorCode: Block['errorCode']; errorMessage: Block['errorMessage']; shouldProcess: boolean }
  /** 将块入队等待向量重建 */
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<Block, 'id' | 'updatedAt'>>) => void
  /** 触发当前待处理的向量重建 */
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  /** 读取排队中的富化请求 */
  getQueuedEnrichRequests: () => QueuedEnrichRequest[]
  /** 写入排队中的富化请求 */
  setQueuedEnrichRequests: (value: QueuedEnrichRequest[]) => void
  /** 是否已销毁 */
  getDisposed: () => boolean
}

export interface BlockModule {
  createBlockWithAttachments: (
    content: string,
    now: string,
    initialState: {
      status: Block['status']
      aiMode: AIExecutionMode
      errorCode: Block['errorCode']
      errorMessage: Block['errorMessage']
    },
  ) => Block
  updateBlockWithAttachments: (
    id: string,
    content: string,
    updatedAt: string,
    initialState: {
      status: Block['status']
      aiMode: AIExecutionMode
      errorCode: Block['errorCode']
      errorMessage: Block['errorMessage']
    },
  ) => Block
  deleteBlocksWithEffects: (
    ids: string[],
    removeOptions?: { strict?: boolean },
  ) => {
    deletedBlocks: Block[]
    touchedNotebookIds: string[]
  }
  createStandaloneBlock: (content: string) => Promise<Block>
  createBlock: (content: string) => Promise<Block>
  getBlock: (id: string) => Promise<Block>
  getBlocks: (ids: string[]) => Promise<Block[]>
  getBlockContext: (id: string, options?: { before?: number; after?: number }) => Promise<Block[]>
  listBlocks: (params?: { limit?: number; cursor?: BlockListCursor | null }) => Promise<BlockListPage>
  listBlocksByDate: (date: string) => Promise<Block[]>
  updateBlock: (id: string, content: string) => Promise<Block>
  removeBlock: (id: string) => Promise<void>
  removeBlocks: (ids: string[]) => Promise<{ removed: number; removedIds: string[] }>
  findRelatedBlocks: (blockId: string, limit?: number) => Promise<RelatedBlockResult[]>
  addTag: (blockId: string, tagName: string) => Promise<Block>
  removeTag: (blockId: string, tagId: string) => Promise<Block>
  listTags: (query?: string) => Promise<TagSuggestion[]>
  saveImage: (dataUrl: string, filenameHint?: string) => Promise<{ fileUrl: string; markdownAlt: string }>
}

export function createBlockModule(deps: BlockDeps): BlockModule {
  const {
    db,
    options,
    vectorReady,
    emitBlockChangedWithDerivedInvalidation,
    emitTouchedNotebooks,
    emitMetaChanged,
    trackTask,
    getExecutionMode,
    getUiSettings,
    clearDailyReviewCache,
    scheduleEnrich,
    advanceBlockEnrichGeneration,
    buildInitialBlockState,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    getQueuedEnrichRequests,
    setQueuedEnrichRequests,
  } = deps

  /** 创建块记录并同步附件 */
  function createBlockWithAttachments(
    content: string,
    now: string,
    initialState: {
      status: Block['status']
      aiMode: AIExecutionMode
      errorCode: Block['errorCode']
      errorMessage: Block['errorMessage']
    },
  ): Block {
    const transaction = db.transaction(() => {
      const block = createBlockRecord(db, {
        id: uuid(),
        content,
        status: initialState.status,
        aiMode: initialState.aiMode,
        errorCode: initialState.errorCode,
        errorMessage: initialState.errorMessage,
        createdAt: now,
        updatedAt: now,
      })

      syncBlockAttachmentRecords(db, options.dataDirectory, block.id, content)
      removeFailedBlockVector(db, block.id)
      return block
    })

    return transaction()
  }

  /** 更新块内容并同步附件、标签、日历建议和向量 */
  function updateBlockWithAttachments(
    id: string,
    content: string,
    updatedAt: string,
    initialState: {
      status: Block['status']
      aiMode: AIExecutionMode
      errorCode: Block['errorCode']
      errorMessage: Block['errorMessage']
    },
  ): Block {
    const transaction = db.transaction(() => {
      updateBlockContent(db, {
        id,
        content,
        status: initialState.status,
        aiMode: initialState.aiMode,
        updatedAt,
      })

      let block = getBlockById(db, id)

      if (initialState.status === 'skipped') {
        block = updateBlockState(db, {
          id,
          status: initialState.status,
          aiMode: initialState.aiMode,
          updatedAt,
          errorCode: initialState.errorCode,
          errorMessage: initialState.errorMessage,
        })
      }

      syncBlockAttachmentRecords(db, options.dataDirectory, id, content)
      clearAutoBlockTags(db, id)
      clearCalendarSuggestionsForBlock(db, id)

      if (vectorReady) {
        deleteBlockVector(db, id)
      }

      removeFailedBlockVector(db, id)
      return block
    })

    return transaction()
  }

  /** 批量删除块，级联处理附件、向量、富化队列和 notebook 关联 */
  function deleteBlocksWithEffects(
    ids: string[],
    removeOptions: { strict?: boolean } = {},
  ): {
    deletedBlocks: Block[]
    touchedNotebookIds: string[]
  } {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)))

    if (uniqueIds.length === 0) {
      return {
        deletedBlocks: [],
        touchedNotebookIds: [],
      }
    }

    const removedIdSet = new Set(uniqueIds)
    setQueuedEnrichRequests(getQueuedEnrichRequests().filter((request) => !removedIdSet.has(request.blockId)))

    const touchedNotebookIds = new Set<string>()

    const deletedBlocks = db.transaction(() => {
      const removed: Block[] = []
      const now = new Date().toISOString()

      for (const id of uniqueIds) {
        let block: Block

        try {
          block = getBlockById(db, id)
        } catch (error) {
          if (removeOptions.strict) {
            throw error
          }

          continue
        }

        advanceBlockEnrichGeneration(id)

        for (const notebookId of touchNotebooksForBlock(db, id, now)) {
          touchedNotebookIds.add(notebookId)
        }

        removed.push(deleteBlockRecord(db, block.id))

        if (vectorReady) {
          deleteBlockVector(db, block.id)
        }

        removePendingBlockVectors(db, [block.id])
        removeFailedBlockVector(db, block.id)
      }

      return removed
    })()

    if (deletedBlocks.length > 0) {
      clearDailyReviewCache()
      emitTouchedNotebooks(Array.from(touchedNotebookIds), 'block-unlinked')
      emitMetaChanged({
        reason: 'vector-queue',
      })

      for (const deletedBlock of deletedBlocks) {
        emitBlockChangedWithDerivedInvalidation({
          block: deletedBlock,
          reason: 'deleted',
        })
      }

      void trackTask(
        (async () => {
          const { cleanupOrphanAttachments: cleanup } = await import('./services/attachments')
          return cleanup(db, options.dataDirectory)
        })(),
      )
    }

    return {
      deletedBlocks,
      touchedNotebookIds: Array.from(touchedNotebookIds),
    }
  }

  /** 创建独立的块（非 notebook 内块） */
  async function createStandaloneBlock(content: string): Promise<Block> {
    const safeContent = validateBlockContent(content, getUiSettings().language)
    const now = new Date().toISOString()
    const aiMode = getExecutionMode()
    const initialState = buildInitialBlockState(safeContent, aiMode)
    const block = createBlockWithAttachments(safeContent, now, initialState)
    const enrichGeneration = advanceBlockEnrichGeneration(block.id)
    clearDailyReviewCache()

    emitBlockChangedWithDerivedInvalidation({
      block,
      reason: 'created',
    })

    if (initialState.shouldProcess) {
      scheduleEnrich(block.id, safeContent, enrichGeneration)
      enqueueBlocksForVectorReindex([block])
      scheduleCurrentVectorReindex()
    }

    return block
  }

  return {
    createBlockWithAttachments,
    updateBlockWithAttachments,
    deleteBlocksWithEffects,
    createStandaloneBlock,

    async createBlock(content) {
      return createStandaloneBlock(content)
    },

    async getBlock(id) {
      return getBlockById(db, id)
    },

    async getBlocks(ids) {
      const dedupedIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)))

      if (dedupedIds.length === 0) {
        return []
      }

      const blocks = getBlocksByIds(db, dedupedIds)
      const blockMap = new Map(blocks.map((block) => [block.id, block]))

      return dedupedIds.flatMap((id) => {
        const block = blockMap.get(id)
        return block ? [block] : []
      })
    },

    async getBlockContext(id, options = {}) {
      return getBlockContextWindow(db, id, options)
    },

    async listBlocks(params = {}) {
      return listBlocksInDb(db, {
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
        cursor: params.cursor ?? null,
      }) as BlockListPage
    },

    async listBlocksByDate(date) {
      return listBlocksByDateInDb(db, date)
    },

    async updateBlock(id, content) {
      const safeContent = validateBlockContent(content, getUiSettings().language)
      const enrichGeneration = advanceBlockEnrichGeneration(id)
      const aiMode = getExecutionMode()
      const updatedAt = new Date().toISOString()
      const initialState = buildInitialBlockState(safeContent, aiMode)
      const block = updateBlockWithAttachments(id, safeContent, updatedAt, initialState)
      clearDailyReviewCache()
      emitTouchedNotebooks(touchNotebooksForBlock(db, id, updatedAt), 'updated')

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'updated',
      })

      if (initialState.shouldProcess) {
        scheduleEnrich(id, safeContent, enrichGeneration)
        enqueueBlocksForVectorReindex([block])
        scheduleCurrentVectorReindex()
      }

      void trackTask(
        (async () => {
          const { cleanupOrphanAttachments: cleanup } = await import('./services/attachments')
          return cleanup(db, options.dataDirectory)
        })(),
      )

      return getBlockById(db, id)
    },

    async removeBlock(id) {
      deleteBlocksWithEffects([id], { strict: true })
    },

    async removeBlocks(ids) {
      const { deletedBlocks } = deleteBlocksWithEffects(ids)

      return {
        removed: deletedBlocks.length,
        removedIds: deletedBlocks.map((block) => block.id),
      }
    },

    async findRelatedBlocks(blockId, limit = 10): Promise<RelatedBlockResult[]> {
      const matches = findRelatedBlockIds(db, blockId, limit)

      if (matches.length === 0) {
        return []
      }

      const blockIds = matches.map((m) => m.id)
      const blocks = getBlocksByIds(db, blockIds)
      const blockMap = new Map(blocks.map((b) => [b.id, b]))

      return matches
        .map((m) => {
          const block = blockMap.get(m.id)
          return block ? { block, score: m.score } : null
        })
        .filter((r): r is RelatedBlockResult => r !== null)
    },

    async addTag(blockId, tagName) {
      const tag = getOrCreateTag(db, tagName, 'user')
      const block = addManualTagToBlock(db, blockId, tag)
      emitTouchedNotebooks(touchNotebooksForBlock(db, blockId, new Date().toISOString()), 'updated')

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'tagged',
      })

      return block
    },

    async removeTag(blockId, tagId) {
      const block = removeTagFromBlock(db, blockId, tagId)
      emitTouchedNotebooks(touchNotebooksForBlock(db, blockId, new Date().toISOString()), 'updated')

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'tagged',
      })

      return block
    },

    async listTags(query = '') {
      return listAvailableTags(db, query, 50)
    },

    async saveImage(dataUrl, filenameHint) {
      return saveImageDataUrl(db, options.dataDirectory, dataUrl, filenameHint)
    },
  }
}
