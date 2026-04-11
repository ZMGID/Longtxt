/**
 * 块富化（enrich）子模块 —— 从 appContext.ts 中提取的标签补全、
 * 后台处理队列、日历同步等逻辑。
 *
 * 设计理由：appContext.ts 承担了几乎所有数据编排职责，文件过大。
 * 将 enrich 链路独立为工厂模块后，主文件只需传入依赖即可复用。
 */

import type { AIExecutionMode, Block } from '../shared/types'
import { MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH } from '../shared/config'
import {
  type RecentBlockContentRow,
  buildBlockSearchText,
  getBlockById,
  getBlocksByIds,
  getBlockSearchTextsByIds,
  listRecentBlockContentRows,
  replaceBlockImageDerivedData,
  updateBlockEnrichmentResult,
  updateBlockState,
} from './db/blocks'
import {
  autoAcceptCalendarSuggestionsForBlock,
  clearCalendarSuggestionsForBlock,
  replaceCalendarSuggestionsForBlock,
} from './db/calendar'
import { getOrCreateTag, getTagMemory } from './db/tags'
import { syncAutoBlockTags } from './db/blocks'
import { removePendingBlockVectors, removeFailedBlockVector } from './db/vectors'
import { countPendingBlockVectors } from './db/vectors'
import {
  getBackgroundProcessingDecision,
  isTransientEnrichError,
  shouldProbeCalendarSuggestions,
  sleep,
} from './appContext-utils'
import type { QueuedEnrichRequest } from './appContext-types'
import { hasMarkdownImages, resolveBlockImageInputs } from './services/attachments'
import type { TagAssignmentResult } from './services/tagger'
import type { LLMProvider } from './services/ai'
import { getSetting as getDbSetting } from './db/settings'

// ── 常量 ────────────────────────────────────────────────

const MAX_ENRICH_RETRIES = 1
const ENRICH_RETRY_DELAY_MS = 500
const TAGGER_CORPUS_LIMIT = 50
const MAX_ENRICH_IMAGES = 4
const BACKGROUND_PROCESSING_PAUSED_KEY = 'background_processing_paused'

// ── 依赖接口 ────────────────────────────────────────────

export interface EnrichDeps {
  db: import('better-sqlite3').Database
  options: import('./appContext-types').AppContextOptions
  tagger: ReturnType<typeof import('./services/tagger').createTaggerEngine>
  emitBlockChangedWithDerivedInvalidation: (event: { block: import('../shared/types').Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  emitCalendarChanged: (event: import('../shared/types').CalendarChangedEvent) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  getProviders: () => { mode: import('../shared/types').AIExecutionMode; embeddingProvider: import('./services/ai').EmbeddingProvider | null; llmProvider: import('./services/ai').LLMProvider | null }
  getSavedConfig: () => import('../shared/types').AIConfig
  getExecutionMode: () => import('../shared/types').AIExecutionMode
  getBlockEnrichSettings: () => import('../shared/types').BlockEnrichSettings
  getCalendarSettings: () => import('../shared/types').CalendarSettings
  getUiSettings: () => { language: import('../shared/types').AppLanguage }
  clearRuntimeAiError: () => boolean
  rememberRuntimeAiError: (error: unknown) => void
  t: (zh: string, en: string) => string
  // 向量回调
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<import('../shared/types').Block, 'id' | 'updatedAt'>>) => void
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  // 可变状态
  getDisposed: () => boolean
  getBlockEnrichGenerations: () => Map<string, number>
  getQueuedEnrichRequests: () => import('./appContext-types').QueuedEnrichRequest[]
  setQueuedEnrichRequests: (value: import('./appContext-types').QueuedEnrichRequest[]) => void
  getQueuedEnrichTimer: () => ReturnType<typeof setTimeout> | null
  setQueuedEnrichTimer: (value: ReturnType<typeof setTimeout> | null) => void
  getQueuedEnrichFlushTask: () => Promise<void> | null
  setQueuedEnrichFlushTask: (value: Promise<void> | null) => void
}

// ── 运行时快照 ──────────────────────────────────────────

export interface EnrichRuntimeSnapshot {
  mode: AIExecutionMode
  llmProvider: LLMProvider
  tagMemory: ReturnType<typeof getTagMemory>
  recentCorpusRows: RecentBlockContentRow[]
  imageAnalysisEnabled: boolean
}

export interface CompletedEnrichAssignment {
  blockId: string
  content: string
  generation: number
  assignment: TagAssignmentResult
}

// ── 模块返回类型 ────────────────────────────────────────

export interface EnrichModule {
  isBackgroundProcessingPaused: () => boolean
  countBlocksByStatus: (status: Block['status']) => number
  countOversizedSkippedBlocks: () => number
  getBlockProcessingDecision: (content: string) => ReturnType<typeof getBackgroundProcessingDecision>
  buildInitialBlockState: (content: string, aiMode: AIExecutionMode) => {
    status: Block['status']
    aiMode: AIExecutionMode
    errorCode: Block['errorCode']
    errorMessage: Block['errorMessage']
    shouldProcess: boolean
  }
  mapRuntimeErrorToBlockErrorCode: (error: unknown) => Block['errorCode']
  recoverOversizedPendingBlocksOnStartup: () => number
  resumeBackgroundProcessingBacklog: () => void
  scheduleBlocksForImageAnalysisRefresh: (blockIds: string[]) => void
  clearBlocksImageAnalysisDerivedState: (blockIds: string[]) => Block[]
  advanceBlockEnrichGeneration: (blockId: string) => number
  isCurrentBlockEnrichGeneration: (blockId: string, generation: number) => boolean
  getFreshBlockForEnrich: (blockId: string, generation: number) => Block | null
  createEnrichRuntimeSnapshot: (requestCount?: number) => EnrichRuntimeSnapshot
  buildCorpusContentsFromSnapshot: (snapshot: EnrichRuntimeSnapshot, blockId: string, content: string) => string[]
  getTaggerImageInputs: (content: string, snapshot: EnrichRuntimeSnapshot) => {
    images: Awaited<ReturnType<typeof resolveBlockImageInputs>>['images']
    skippedCount: number
  } | Promise<{
    images: Awaited<ReturnType<typeof resolveBlockImageInputs>>['images']
    skippedCount: number
  }>
  applyCompletedEnrichAssignments: (entries: CompletedEnrichAssignment[], snapshot: Pick<EnrichRuntimeSnapshot, 'llmProvider' | 'mode'>, previousSearchTextMap?: Map<string, string>) => void
  syncCalendarSuggestionsForBlock: (blockId: string, generation: number, llmProvider: LLMProvider, mode: AIExecutionMode) => Promise<void>
  enrichBlock: (blockId: string, content: string, generation: number, runtimeSnapshot?: EnrichRuntimeSnapshot) => Promise<boolean>
  runEnrichWithRetry: (blockId: string, content: string, generation: number, runtimeSnapshot?: EnrichRuntimeSnapshot) => Promise<boolean>
  shouldUseQueuedEnrich: () => boolean
  getQueuedEnrichBatchOptions: () => { maxBatchBlocks: number; queueDebounceMs: number; responseReserveTokens: number }
  clearQueuedEnrichTimer: () => void
  getActiveQueuedEnrichRequests: (requests: QueuedEnrichRequest[]) => QueuedEnrichRequest[]
  runQueuedEnrichBatchWithRetry: (requests: QueuedEnrichRequest[]) => Promise<void>
  flushQueuedEnrichRequests: () => Promise<void>
  startQueuedEnrichFlush: () => void
  scheduleEnrich: (blockId: string, content: string, generation: number) => void
}

// ── 工厂 ────────────────────────────────────────────────

export function createEnrichModule(deps: EnrichDeps): EnrichModule {
  const {
    db,
    options,
    tagger,
    emitBlockChangedWithDerivedInvalidation,
    emitMetaChanged,
    emitCalendarChanged,
    trackTask,
    getProviders,
    getSavedConfig,
    getExecutionMode,
    getBlockEnrichSettings,
    getCalendarSettings,
    getUiSettings,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    t,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    getDisposed,
    getBlockEnrichGenerations,
    getQueuedEnrichRequests,
    setQueuedEnrichRequests,
    getQueuedEnrichTimer,
    setQueuedEnrichTimer,
    getQueuedEnrichFlushTask,
    setQueuedEnrichFlushTask,
  } = deps

  // ── 处理状态查询 ──────────────────────────────────────

  function isBackgroundProcessingPaused(): boolean {
    if (getDisposed()) {
      return true
    }

    return getDbSetting(db, BACKGROUND_PROCESSING_PAUSED_KEY) === '1'
  }

  function countBlocksByStatus(status: Block['status']): number {
    return (db.prepare(`SELECT COUNT(*) AS total FROM blocks WHERE status = ?`).get(status) as { total: number }).total
  }

  function countOversizedSkippedBlocks(): number {
    return (
      db.prepare(`SELECT COUNT(*) AS total FROM blocks WHERE status = 'skipped' AND error_code = 'too_large'`).get() as { total: number }
    ).total
  }

  function getBlockProcessingDecision(content: string) {
    return getBackgroundProcessingDecision(content, getUiSettings().language, {
      paused: isBackgroundProcessingPaused(),
    })
  }

  function buildInitialBlockState(content: string, aiMode: AIExecutionMode): {
    status: Block['status']
    aiMode: AIExecutionMode
    errorCode: Block['errorCode']
    errorMessage: Block['errorMessage']
    shouldProcess: boolean
  } {
    const decision = getBlockProcessingDecision(content)

    if (!decision.shouldProcess) {
      return {
        status: 'skipped',
        aiMode,
        errorCode: decision.errorCode,
        errorMessage: decision.errorMessage,
        shouldProcess: false,
      }
    }

    return {
      status: 'pending',
      aiMode,
      errorCode: null,
      errorMessage: null,
      shouldProcess: true,
    }
  }

  function mapRuntimeErrorToBlockErrorCode(error: unknown): Block['errorCode'] {
    if (!(error instanceof Error)) {
      return 'provider_error'
    }

    if (/请求超时|timed out|timeout/i.test(error.message)) {
      return 'timeout'
    }

    return 'provider_error'
  }

  // ── 启动恢复 ──────────────────────────────────────────

  function recoverOversizedPendingBlocksOnStartup(): number {
    const rows = db.prepare(
      `
        SELECT id, ai_mode AS aiMode, updated_at AS updatedAt
        FROM blocks
        WHERE status = 'pending'
          AND LENGTH(content) > ?
      `,
    ).all(MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH) as Array<{
      id: string
      aiMode: AIExecutionMode
      updatedAt: string
    }>

    if (rows.length === 0) {
      return 0
    }

    const language = getUiSettings().language
    const errorMessage = language === 'en'
      ? `Recovered on startup: content exceeds the ${MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH.toLocaleString('en-US')}-character AI/vector limit and was saved locally only.`
      : `启动恢复：内容超过 ${MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH.toLocaleString('zh-CN')} 字的 AI / 向量处理上限，已仅做本地保存。`

    const update = db.prepare(
      `
        UPDATE blocks
        SET
          status = 'skipped',
          error_message = ?,
          error_code = 'too_large',
          updated_at = updated_at
        WHERE id = ?
      `,
    )

    const transaction = db.transaction(() => {
      for (const row of rows) {
        update.run(errorMessage, row.id)
        removePendingBlockVectors(db, [row.id])
        removeFailedBlockVector(db, row.id)
      }
    })

    transaction()
    return rows.length
  }

  function resumeBackgroundProcessingBacklog(): void {
    const pendingBlocks = db.prepare(
      `
        SELECT id, content
        FROM blocks
        WHERE status = 'pending'
        ORDER BY updated_at ASC, id ASC
      `,
    ).all() as Array<{ id: string; content: string }>

    for (const block of pendingBlocks) {
      const enrichGeneration = advanceBlockEnrichGeneration(block.id)
      scheduleEnrich(block.id, block.content, enrichGeneration)
    }

    if (countPendingBlockVectors(db) > 0) {
      scheduleCurrentVectorReindex()
    }
  }

  function scheduleBlocksForImageAnalysisRefresh(blockIds: string[]): void {
    if (isBackgroundProcessingPaused()) {
      return
    }

    const dedupedBlockIds = Array.from(new Set(blockIds))

    if (dedupedBlockIds.length === 0) {
      return
    }

    const blocks = getBlocksByIds(db, dedupedBlockIds)

    for (const block of blocks) {
      const enrichGeneration = advanceBlockEnrichGeneration(block.id)
      scheduleEnrich(block.id, block.content, enrichGeneration)
    }
  }

  function clearBlocksImageAnalysisDerivedState(blockIds: string[]): Block[] {
    const updatedBlocks: Block[] = []

    for (const block of getBlocksByIds(db, blockIds)) {
      updatedBlocks.push(replaceBlockImageDerivedData(
        db,
        block.id,
        null,
        buildBlockSearchText(block.content),
      ))
    }

    return updatedBlocks
  }

  // ── 富化代际追踪 ──────────────────────────────────────

  function advanceBlockEnrichGeneration(blockId: string): number {
    const blockEnrichGenerations = getBlockEnrichGenerations()
    const nextGeneration = (blockEnrichGenerations.get(blockId) ?? 0) + 1
    blockEnrichGenerations.set(blockId, nextGeneration)
    return nextGeneration
  }

  function isCurrentBlockEnrichGeneration(blockId: string, generation: number): boolean {
    return getBlockEnrichGenerations().get(blockId) === generation
  }

  function getFreshBlockForEnrich(blockId: string, generation: number): Block | null {
    if (!isCurrentBlockEnrichGeneration(blockId, generation)) {
      return null
    }

    try {
      return getBlockById(db, blockId)
    } catch {
      return null
    }
  }

  function createEnrichRuntimeSnapshot(requestCount = 1): EnrichRuntimeSnapshot {
    const { mode, llmProvider } = getProviders()
    const config = getSavedConfig()

    return {
      mode,
      llmProvider: llmProvider!,
      tagMemory: getTagMemory(db),
      recentCorpusRows: listRecentBlockContentRows(db, TAGGER_CORPUS_LIMIT + Math.max(1, requestCount)),
      imageAnalysisEnabled: mode === 'live' && config.multimodalImageAnalysisEnabled,
    }
  }

  function buildCorpusContentsFromSnapshot(
    snapshot: EnrichRuntimeSnapshot,
    blockId: string,
    content: string,
  ): string[] {
    const corpusContents = [content]

    for (const entry of snapshot.recentCorpusRows) {
      if (entry.blockId === blockId || entry.content === content) {
        continue
      }

      corpusContents.push(entry.content)

      if (corpusContents.length >= TAGGER_CORPUS_LIMIT + 1) {
        break
      }
    }

    return corpusContents
  }

  function getTaggerImageInputs(content: string, snapshot: EnrichRuntimeSnapshot): {
    images: Awaited<ReturnType<typeof resolveBlockImageInputs>>['images']
    skippedCount: number
  } | Promise<{
    images: Awaited<ReturnType<typeof resolveBlockImageInputs>>['images']
    skippedCount: number
  }> {
    if (!snapshot.imageAnalysisEnabled || !hasMarkdownImages(content)) {
      return {
        images: [],
        skippedCount: 0,
      }
    }

    return resolveBlockImageInputs(options.dataDirectory, content, MAX_ENRICH_IMAGES).then((resolved) => ({
      images: resolved.images,
      skippedCount: resolved.skippedCount,
    }))
  }

  // ── 应用结果 & 日历同步 ───────────────────────────────

  function applyCompletedEnrichAssignments(
    entries: CompletedEnrichAssignment[],
    snapshot: Pick<EnrichRuntimeSnapshot, 'llmProvider' | 'mode'>,
    previousSearchTextMap?: Map<string, string>,
  ): void {
    if (entries.length === 0) {
      return
    }

    const freshEntries = entries
      .map((entry) => {
        const currentBlock = getFreshBlockForEnrich(entry.blockId, entry.generation)

        if (!currentBlock) {
          return null
        }

        return {
          ...entry,
          currentBlock,
        }
      })
      .filter((entry): entry is CompletedEnrichAssignment & { currentBlock: Block } => Boolean(entry))

    if (freshEntries.length === 0) {
      return
    }

    const resolvedPreviousSearchTextMap = previousSearchTextMap
      ?? getBlockSearchTextsByIds(db, freshEntries.map((entry) => entry.blockId))
    const updatedBlocks: Block[] = []
    const reindexBlocks: Array<Pick<Block, 'id' | 'updatedAt'>> = []

    for (const entry of freshEntries) {
      const tags = [
        ...entry.assignment.categories.map((tagName) => getOrCreateTag(db, tagName, 'category')),
        ...entry.assignment.detailTags.map((tagName) => getOrCreateTag(db, tagName, 'detail')),
      ]

      syncAutoBlockTags(db, entry.blockId, tags)

      const previousSearchText = resolvedPreviousSearchTextMap.get(entry.blockId) ?? entry.content
      const nextSearchText = buildBlockSearchText(entry.content, entry.assignment.imageAnnotations)
      const block = updateBlockEnrichmentResult(db, {
        id: entry.blockId,
        status: 'ready',
        aiMode: snapshot.mode,
        summary: entry.assignment.summary,
        imageAnnotations: entry.assignment.imageAnnotations,
        searchText: nextSearchText,
        updatedAt: entry.currentBlock.updatedAt,
      })

      updatedBlocks.push(block)

      if (nextSearchText !== previousSearchText) {
        reindexBlocks.push(block)
      }
    }

    for (const block of updatedBlocks) {
      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'enriched',
      })
    }

    if (reindexBlocks.length > 0) {
      enqueueBlocksForVectorReindex(reindexBlocks)
      scheduleCurrentVectorReindex()
    }

    for (const entry of freshEntries) {
      void trackTask(syncCalendarSuggestionsForBlock(entry.blockId, entry.generation, snapshot.llmProvider, snapshot.mode))
    }
  }

  async function syncCalendarSuggestionsForBlock(
    blockId: string,
    generation: number,
    llmProvider: LLMProvider,
    mode: AIExecutionMode,
  ): Promise<void> {
    const currentBlock = getFreshBlockForEnrich(blockId, generation)

    if (!currentBlock) {
      return
    }

    const calendarSettings = getCalendarSettings()

    if (!calendarSettings.aiSuggestionsEnabled || calendarSettings.maxSuggestionsPerBlock <= 0 || mode !== 'live') {
      clearCalendarSuggestionsForBlock(db, blockId)
      emitCalendarChanged({
        reason: 'suggestion-updated',
        sourceBlockId: blockId,
      })
      return
    }

    if (!shouldProbeCalendarSuggestions(currentBlock.content)) {
      clearCalendarSuggestionsForBlock(db, blockId)
      emitCalendarChanged({
        reason: 'suggestion-updated',
        sourceBlockId: blockId,
      })
      return
    }

    try {
      const suggestions = await llmProvider.extractCalendarSuggestions({
        content: currentBlock.content,
        referenceDate: currentBlock.createdAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        maxSuggestions: calendarSettings.maxSuggestionsPerBlock,
      })
      const latestBlock = getFreshBlockForEnrich(blockId, generation)

      if (!latestBlock) {
        return
      }

      const suggestionInputs = suggestions.map((suggestion) => ({
        title: suggestion.title,
        notes: suggestion.notes,
        date: suggestion.date,
        startTime: suggestion.startTime,
        allDay: suggestion.allDay,
        confidence: suggestion.confidence,
        evidenceText: suggestion.evidenceText,
      }))
      const now = new Date().toISOString()

      if (calendarSettings.autoAcceptAiSuggestions) {
        autoAcceptCalendarSuggestionsForBlock(
          db,
          blockId,
          suggestionInputs,
          now,
        )
      } else {
        replaceCalendarSuggestionsForBlock(
          db,
          blockId,
          suggestionInputs,
          now,
        )
      }

      if (mode === 'live' && clearRuntimeAiError()) {
        emitMetaChanged({
          reason: 'calendar-suggestion',
        })
      }

      emitCalendarChanged({
        reason: 'suggestion-updated',
        sourceBlockId: blockId,
      })
    } catch (error) {
      if (mode === 'live') {
        rememberRuntimeAiError(error)
        emitMetaChanged({
          reason: 'calendar-suggestion',
        })
      }
    }
  }

  // ── 核心富化流程 ──────────────────────────────────────

  async function enrichBlock(
    blockId: string,
    content: string,
    generation: number,
    runtimeSnapshot = createEnrichRuntimeSnapshot(),
  ): Promise<boolean> {
    const imageInputResult = getTaggerImageInputs(content, runtimeSnapshot)
    const { images, skippedCount } = imageInputResult instanceof Promise
      ? await imageInputResult
      : imageInputResult
    const assignment = await tagger.assign(content, {
      corpusContents: buildCorpusContentsFromSnapshot(runtimeSnapshot, blockId, content),
      liveLlmProvider: runtimeSnapshot.mode === 'live' ? runtimeSnapshot.llmProvider : null,
      imageInputs: images,
      skippedImageCount: skippedCount,
      tagMemory: runtimeSnapshot.tagMemory,
    })

    if (runtimeSnapshot.mode === 'live') {
      clearRuntimeAiError()
    }

    applyCompletedEnrichAssignments([
      {
        blockId,
        content,
        generation,
        assignment,
      },
    ], runtimeSnapshot)

    return Boolean(getFreshBlockForEnrich(blockId, generation))
  }

  async function runEnrichWithRetry(
    blockId: string,
    content: string,
    generation: number,
    runtimeSnapshot?: EnrichRuntimeSnapshot,
  ): Promise<boolean> {
    const aiMode = getExecutionMode()
    const decision = getBlockProcessingDecision(content)

    if (!decision.shouldProcess) {
      const currentBlock = getFreshBlockForEnrich(blockId, generation)

      if (!currentBlock) {
        return false
      }

      const block = updateBlockState(db, {
        id: blockId,
        status: 'skipped',
        aiMode,
        updatedAt: currentBlock.updatedAt,
        errorCode: decision.errorCode,
        errorMessage: decision.errorMessage,
      })

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'enriched',
      })

      return false
    }

    for (let attempt = 0; attempt <= MAX_ENRICH_RETRIES; attempt += 1) {
      try {
        return await enrichBlock(blockId, content, generation, runtimeSnapshot ?? createEnrichRuntimeSnapshot())
      } catch (error) {
        const currentBlock = getFreshBlockForEnrich(blockId, generation)

        if (!currentBlock) {
          return false
        }

        const isLastAttempt = attempt === MAX_ENRICH_RETRIES
        const shouldRetry = aiMode === 'live' && isTransientEnrichError(error) && !isLastAttempt

        if (shouldRetry) {
          const block = updateBlockState(db, {
            id: blockId,
            status: 'pending',
            aiMode,
            updatedAt: currentBlock.updatedAt,
            errorCode: null,
            errorMessage: error instanceof Error
              ? `${t('自动重试中', 'Auto retrying')}: ${error.message}`
              : t('自动重试中。', 'Auto retrying.'),
          })

          emitBlockChangedWithDerivedInvalidation({
            block,
            reason: 'enriched',
          })

          await sleep(ENRICH_RETRY_DELAY_MS)
          continue
        }

        if (aiMode === 'live') {
          rememberRuntimeAiError(error)
        }

        const failedBlock = getFreshBlockForEnrich(blockId, generation)

        if (!failedBlock) {
          return false
        }

        const block = updateBlockState(db, {
          id: blockId,
          status: 'error',
          aiMode,
          updatedAt: failedBlock.updatedAt,
          errorCode: mapRuntimeErrorToBlockErrorCode(error),
          errorMessage: error instanceof Error ? error.message : t('后台处理失败。', 'Background processing failed.'),
        })

        emitBlockChangedWithDerivedInvalidation({
          block,
          reason: 'enriched',
        })

        return false
      }
    }

    return false
  }

  function shouldUseQueuedEnrich(): boolean {
    return getExecutionMode() === 'live' && getBlockEnrichSettings().queueEnabled
  }

  function getQueuedEnrichBatchOptions(): {
    maxBatchBlocks: number
    queueDebounceMs: number
    responseReserveTokens: number
  } {
    const settings = getBlockEnrichSettings()

    return {
      maxBatchBlocks: settings.maxBatchBlocks,
      queueDebounceMs: settings.queueDebounceMs,
      responseReserveTokens: settings.responseReserveTokens,
    }
  }

  function clearQueuedEnrichTimer(): void {
    const timer = getQueuedEnrichTimer()
    if (timer) {
      clearTimeout(timer)
      setQueuedEnrichTimer(null)
    }
  }

  function getActiveQueuedEnrichRequests(requests: QueuedEnrichRequest[]): QueuedEnrichRequest[] {
    return requests.filter((request) => getFreshBlockForEnrich(request.blockId, request.generation))
  }

  async function runQueuedEnrichBatchWithRetry(requests: QueuedEnrichRequest[]): Promise<void> {
    if (requests.length === 0) {
      return
    }

    if (!shouldUseQueuedEnrich()) {
      for (const request of requests) {
        await runEnrichWithRetry(request.blockId, request.content, request.generation)
      }
      return
    }

    const batchOptions = getQueuedEnrichBatchOptions()

    for (let attempt = 0; attempt <= MAX_ENRICH_RETRIES; attempt += 1) {
      const currentRequests = getActiveQueuedEnrichRequests(requests)

      if (currentRequests.length === 0) {
        return
      }

      const runtimeSnapshot = createEnrichRuntimeSnapshot(currentRequests.length)

      const imageRequests = currentRequests.filter((request) => request.hasImages)

      if (imageRequests.length > 0) {
        for (const request of imageRequests) {
          await runEnrichWithRetry(request.blockId, request.content, request.generation, runtimeSnapshot)
        }
      }

      const textOnlyRequests = currentRequests.filter((request) => !request.hasImages)

      if (textOnlyRequests.length === 0) {
        return
      }

      try {
        const assignments = await tagger.assignBatch(
          textOnlyRequests.map((request) => ({
            content: request.content,
            options: {
              corpusContents: buildCorpusContentsFromSnapshot(runtimeSnapshot, request.blockId, request.content),
              liveLlmProvider: runtimeSnapshot.mode === 'live' ? runtimeSnapshot.llmProvider : null,
              batchOptions: {
                maxBatchBlocks: batchOptions.maxBatchBlocks,
                responseReserveTokens: batchOptions.responseReserveTokens,
              },
              tagMemory: runtimeSnapshot.tagMemory,
            },
          })),
        )

        clearRuntimeAiError()
        applyCompletedEnrichAssignments(
          textOnlyRequests.map((request, index) => ({
            blockId: request.blockId,
            content: request.content,
            generation: request.generation,
            assignment: assignments[index],
          })),
          runtimeSnapshot,
          getBlockSearchTextsByIds(db, textOnlyRequests.map((request) => request.blockId)),
        )

        return
      } catch (error) {
        const retryableRequests = getActiveQueuedEnrichRequests(textOnlyRequests)

        if (retryableRequests.length === 0) {
          return
        }

        const isLastAttempt = attempt === MAX_ENRICH_RETRIES
        const shouldRetry = isTransientEnrichError(error) && !isLastAttempt

        if (shouldRetry) {
          for (const request of retryableRequests) {
            const currentBlock = getFreshBlockForEnrich(request.blockId, request.generation)

            if (!currentBlock) {
              continue
            }

            const block = updateBlockState(db, {
              id: request.blockId,
              status: 'pending',
              aiMode: 'live',
              updatedAt: currentBlock.updatedAt,
              errorCode: null,
              errorMessage: error instanceof Error
                ? `${t('自动重试中', 'Auto retrying')}: ${error.message}`
                : t('自动重试中。', 'Auto retrying.'),
            })

            emitBlockChangedWithDerivedInvalidation({
              block,
              reason: 'enriched',
            })
          }

          await sleep(ENRICH_RETRY_DELAY_MS)
          continue
        }

        rememberRuntimeAiError(error)

        for (const request of retryableRequests) {
          const currentBlock = getFreshBlockForEnrich(request.blockId, request.generation)

          if (!currentBlock) {
            continue
          }

          const block = updateBlockState(db, {
            id: request.blockId,
            status: 'error',
            aiMode: 'live',
            updatedAt: currentBlock.updatedAt,
            errorCode: mapRuntimeErrorToBlockErrorCode(error),
            errorMessage: error instanceof Error ? error.message : t('后台处理失败。', 'Background processing failed.'),
          })

          emitBlockChangedWithDerivedInvalidation({
            block,
            reason: 'enriched',
          })
        }

        return
      }
    }
  }

  async function flushQueuedEnrichRequests(): Promise<void> {
    clearQueuedEnrichTimer()

    while (getQueuedEnrichRequests().length > 0) {
      const requests = getQueuedEnrichRequests()
      setQueuedEnrichRequests([])
      await runQueuedEnrichBatchWithRetry(requests)
    }
  }

  function startQueuedEnrichFlush(): void {
    clearQueuedEnrichTimer()

    if (isBackgroundProcessingPaused()) {
      setQueuedEnrichRequests([])
      return
    }

    if (getQueuedEnrichFlushTask()) {
      return
    }

    const task = (async () => {
      try {
        await flushQueuedEnrichRequests()
      } finally {
        setQueuedEnrichFlushTask(null)
      }
    })()

    setQueuedEnrichFlushTask(trackTask(task))
  }

  function scheduleEnrich(blockId: string, content: string, generation: number): void {
    const hasImages = hasMarkdownImages(content)
    const decision = getBlockProcessingDecision(content)

    if (!decision.shouldProcess) {
      const currentBlock = getFreshBlockForEnrich(blockId, generation)

      if (!currentBlock) {
        return
      }

      const block = updateBlockState(db, {
        id: blockId,
        status: 'skipped',
        aiMode: currentBlock.aiMode,
        updatedAt: currentBlock.updatedAt,
        errorCode: decision.errorCode,
        errorMessage: decision.errorMessage,
      })

      emitBlockChangedWithDerivedInvalidation({
        block,
        reason: 'enriched',
      })
      return
    }

    if (!shouldUseQueuedEnrich()) {
      void trackTask(runEnrichWithRetry(blockId, content, generation))
      return
    }

    const queuedEnrichRequests = getQueuedEnrichRequests()
    setQueuedEnrichRequests([
      ...queuedEnrichRequests.filter((request) => request.blockId !== blockId),
      {
        blockId,
        content,
        generation,
        hasImages,
      },
    ])

    const settings = getQueuedEnrichBatchOptions()
    const currentRequests = getQueuedEnrichRequests()

    if (currentRequests.length >= settings.maxBatchBlocks) {
      startQueuedEnrichFlush()
      return
    }

    if (!getQueuedEnrichTimer()) {
      setQueuedEnrichTimer(setTimeout(() => {
        setQueuedEnrichTimer(null)
        startQueuedEnrichFlush()
      }, settings.queueDebounceMs))
    }
  }

  return {
    isBackgroundProcessingPaused,
    countBlocksByStatus,
    countOversizedSkippedBlocks,
    getBlockProcessingDecision,
    buildInitialBlockState,
    mapRuntimeErrorToBlockErrorCode,
    recoverOversizedPendingBlocksOnStartup,
    resumeBackgroundProcessingBacklog,
    scheduleBlocksForImageAnalysisRefresh,
    clearBlocksImageAnalysisDerivedState,
    advanceBlockEnrichGeneration,
    isCurrentBlockEnrichGeneration,
    getFreshBlockForEnrich,
    createEnrichRuntimeSnapshot,
    buildCorpusContentsFromSnapshot,
    getTaggerImageInputs,
    applyCompletedEnrichAssignments,
    syncCalendarSuggestionsForBlock,
    enrichBlock,
    runEnrichWithRetry,
    shouldUseQueuedEnrich,
    getQueuedEnrichBatchOptions,
    clearQueuedEnrichTimer,
    getActiveQueuedEnrichRequests,
    runQueuedEnrichBatchWithRetry,
    flushQueuedEnrichRequests,
    startQueuedEnrichFlush,
    scheduleEnrich,
  }
}
