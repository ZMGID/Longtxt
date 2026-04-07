import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import {
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DEFAULT_PAGE_SIZE,
  DOC_GENERATION_SETTINGS_KEY,
  UI_SETTINGS_KEY,
  parseBlockEnrichSettings,
  parseCalendarSettings,
  parseDocGenerationSettings,
} from '../shared/config'
import type {
  AIConfig,
  AIExecutionMode,
  ApiTestResult,
  BlockEnrichSettings,
  Block,
  CalendarSettings,
  DocGenerationSettings,
  Notebook,
  NotebookReferencePreview,
  RelatedBlockResult,
} from '../shared/types'
import {
  addManualTagToBlock,
  clearAutoBlockTags,
  countBlocks,
  createBlockRecord,
  deleteBlockRecord,
  getBlockById,
  getBlocksByIds,
  listBlocksByDate as listBlocksByDateInDb,
  listRecentBlockContents,
  listBlocks,
  removeTagFromBlock,
  syncAutoBlockTags,
  updateBlockContent,
  updateBlockState,
} from './db/blocks'
import {
  acceptCalendarSuggestion,
  autoAcceptCalendarSuggestionsForBlock,
  clearCalendarSuggestionsForBlock,
  createCalendarEntry,
  dismissCalendarSuggestion,
  getCalendarDayDetail,
  getCalendarHeatmap,
  listCalendarYears,
  listUpcomingCalendarEntries,
  removeCalendarEntry,
  replaceCalendarSuggestionsForBlock,
  updateCalendarEntry,
} from './db/calendar'
import { initializeDatabase } from './db'
import { getGraphData as loadGraphData } from './db/graph'
import {
  addBlockToNotebook,
  appendBlockToNotebook,
  createNotebookRecord,
  createNotebookStructureItem,
  deleteNotebookRecord,
  ensureNotebookExists,
  getNotebookById,
  listNotebookBlockEntries,
  listNotebooks,
  listNotebookReferenceReviews,
  removeItemFromNotebook,
  reorderNotebookItems,
  touchNotebooksForBlock,
  updateNotebookReferenceReview,
  updateNotebookStructureItem,
  updateNotebookTitle,
} from './db/notebooks'
import { searchBlocks as searchBlocksInDatabase, searchBlocksByTag } from './db/search'
import { getSetting as getDbSetting, parseAIConfig, setSetting as setDbSetting } from './db/settings'
import { createSnapshot, getSnapshot, listSnapshots, removeSnapshot } from './db/snapshots'
import { getOrCreateTag, getTagMemory, listAvailableTags } from './db/tags'
import {
  countBlockVectors,
  countPendingBlockVectors,
  countFailedBlockVectors,
  clearFailedBlockVectors,
  deleteBlockVector,
  enqueueBlockVector,
  ensureVectorSchema,
  insertFailedBlockVector,
  getPendingBlockVectorsByIds,
  getVectorSchemaDimension,
  listFailedBlockVectors,
  listPendingBlockVectors,
  removeFailedBlockVector,
  removePendingBlockVectors,
  resetPendingBlockVectors,
  upsertBlockVector,
} from './db/vectors'
import { findRelatedBlockIds } from './db/connections'
import {
  DEFAULT_MOCK_EMBEDDING_DIMENSION,
  createConfigFingerprint,
  createLiveEmbeddingProvider,
  createLiveLLMProvider,
  createMockEmbeddingProvider,
  createMockLLMProvider,
  probeAiConfig,
  resolveBaseUrl,
  type EmbeddingProvider,
  type LLMProvider,
} from './services/ai'
import { selectDocumentReferenceBlocks, selectDocumentReferenceResults } from './services/docgen'
import { createTaggerEngine } from './services/tagger'
import {
  cleanupOrphanAttachments as cleanupOrphanAttachmentsService,
  rebuildAttachmentIndex as rebuildAttachmentIndexService,
  saveImageDataUrl,
  syncBlockAttachmentRecords,
} from './services/attachments'
import { confirmImportJob, exportJsonBundle, exportMarkdownBundle, previewJsonImport, previewMarkdownImport } from './services/importExport'
import { createSettingsFileStore, resolveSettingsFilePath } from './settingsFile'
import {
  buildNotebookWritingGuide,
  createLiveVectorIndexState,
  createMockVectorIndexState,
  isAIConfigured,
  isSameVectorIndexState,
  isTransientEnrichError,
  normalizeCalendarDate,
  normalizeCalendarEntryInput,
  normalizeCalendarEntryPatch,
  normalizeCalendarSuggestionAcceptInput,
  normalizeNotebookTitle,
  normalizeNotebookTopic,
  parseApiTestResult,
  parseVectorIndexState,
  shouldProbeCalendarSuggestions,
  sleep,
  todayDateKey,
  validateContent,
} from './appContext-utils'
import { startStreamedDocumentGenerationTask } from './appContext-docgen'
import { createContextEventEmitters, createPendingTaskTracker, createUsageTracker, parseTokenUsage } from './appContext-runtime'
import type { AppContext, AppContextOptions, QueuedEnrichRequest, VectorIndexState } from './appContext-types'

export type { AppContext, AppContextOptions } from './appContext-types'

const AI_LAST_TEST_RESULT_KEY = 'ai_last_test_result'
const TOKEN_USAGE_TOTALS_KEY = 'token_usage_totals'
const VECTOR_INDEX_STATE_KEY = 'vector_index_state'
const FILE_BACKED_SETTING_KEYS = new Set([
  'ai_config',
  AI_LAST_TEST_RESULT_KEY,
  TOKEN_USAGE_TOTALS_KEY,
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DOC_GENERATION_SETTINGS_KEY,
  UI_SETTINGS_KEY,
])
const MAX_ENRICH_RETRIES = 1
const ENRICH_RETRY_DELAY_MS = 500
const TAGGER_CORPUS_LIMIT = 50
const VECTOR_REINDEX_BATCH_SIZE = 12

export function createAppContext(options: AppContextOptions): AppContext {
  mkdirSync(options.dataDirectory, { recursive: true })

  const databasePath = join(options.dataDirectory, 'changbu.sqlite3')
  const db = new Database(databasePath)
  const { vectorReady } = initializeDatabase(db)
  const settingsStore = createSettingsFileStore({
    filePath: options.settingsFilePath ?? resolveSettingsFilePath(options.dataDirectory),
    seedValues: Object.fromEntries(
      Array.from(FILE_BACKED_SETTING_KEYS)
        .map((key) => [key, getDbSetting(db, key)] as const)
        .filter((entry): entry is [string, string] => entry[1] !== null),
    ),
  })
  const tagger = createTaggerEngine()
  const { pendingTasks, trackTask } = createPendingTaskTracker()
  const blockEnrichGenerations = new Map<string, number>()
  let queuedEnrichRequests: QueuedEnrichRequest[] = []
  let queuedEnrichTimer: ReturnType<typeof setTimeout> | null = null
  let queuedEnrichFlushTask: Promise<void> | null = null
  let reindexTask: Promise<void> | null = null
  let reindexRequested = false
  let reindexNeedsFullRebuild = false
  let reindexProviderState: { embeddingProvider: EmbeddingProvider; mode: AIExecutionMode; indexState: VectorIndexState } | null = null
  let activeReindexState: { indexState: VectorIndexState; fullRebuild: boolean } | null = null
  let lastAiError: string | null = null
  let currentVectorDimension = vectorReady ? getVectorSchemaDimension(db) : null
  let vectorSchemaReady = vectorReady ? currentVectorDimension !== null : false
  let currentVectorIndexState = parseVectorIndexState(getDbSetting(db, VECTOR_INDEX_STATE_KEY))
  const importJobs = new Map<string, Awaited<ReturnType<typeof previewMarkdownImport>>['job']>()
  const {
    emitBlockChanged,
    emitNotebooksChanged,
    emitMetaChanged,
    emitCalendarChanged,
    emitDocGenerationChunk,
    emitTouchedNotebooks,
  } = createContextEventEmitters(options)
  const { tokenSink, getModelCallCounts, getTokenUsage, getLifetimeTokenUsage } = createUsageTracker({
    emitMetaChanged,
    initialLifetimeUsage: parseTokenUsage(settingsStore.get(TOKEN_USAGE_TOTALS_KEY)),
    persistLifetimeUsage(usage) {
      settingsStore.set(TOKEN_USAGE_TOTALS_KEY, JSON.stringify(usage))
    },
  })

  void trackTask(rebuildAttachmentIndexService(db, options.dataDirectory))

  function getLastAiTestResult(): ApiTestResult | null {
    return parseApiTestResult(settingsStore.get(AI_LAST_TEST_RESULT_KEY))
  }

  function getSavedConfig(): AIConfig {
    return parseAIConfig(settingsStore.get('ai_config'))
  }

  function getDocGenerationSettings(): DocGenerationSettings {
    return parseDocGenerationSettings(settingsStore.get(DOC_GENERATION_SETTINGS_KEY))
  }

  function getBlockEnrichSettings(): BlockEnrichSettings {
    return parseBlockEnrichSettings(settingsStore.get(BLOCK_ENRICH_SETTINGS_KEY))
  }

  function getCalendarSettings(): CalendarSettings {
    return parseCalendarSettings(settingsStore.get(CALENDAR_SETTINGS_KEY))
  }

  function getSavedConfigFingerprint(): string | null {
    const config = getSavedConfig()
    return isAIConfigured(config) ? createConfigFingerprint(config) : null
  }

  function persistVectorIndexState(state: VectorIndexState | null): void {
    currentVectorIndexState = state
    setDbSetting(db, VECTOR_INDEX_STATE_KEY, state ? JSON.stringify(state) : '')
  }

  function getPreferredVectorDimension(): number {
    return getLastAiTestResult()?.embeddingDimension ?? currentVectorDimension ?? DEFAULT_MOCK_EMBEDDING_DIMENSION
  }

  function getExecutionMode(): AIExecutionMode {
    const config = getSavedConfig()
    const lastTestResult = getLastAiTestResult()
    const savedFingerprint = getSavedConfigFingerprint()

    return isAIConfigured(config) && lastTestResult?.success && Boolean(savedFingerprint) && lastTestResult.configFingerprint === savedFingerprint
      ? 'live'
      : 'mock'
  }

  function getDesiredVectorIndexState(): VectorIndexState | null {
    const config = getSavedConfig()
    const savedFingerprint = getSavedConfigFingerprint()

    if (!isAIConfigured(config)) {
      return createMockVectorIndexState()
    }

    if (getExecutionMode() === 'live' && savedFingerprint) {
      return createLiveVectorIndexState(savedFingerprint)
    }

    return null
  }

  function isVectorIndexCompatible(targetState: VectorIndexState | null): boolean {
    return vectorReady && vectorSchemaReady && isSameVectorIndexState(currentVectorIndexState, targetState)
  }

  function canUseVectorSearch(): boolean {
    return isVectorIndexCompatible(getDesiredVectorIndexState())
  }

  function getProviders(): {
    mode: AIExecutionMode
    embeddingProvider: EmbeddingProvider
    llmProvider: LLMProvider
  } {
    const config = getSavedConfig()
    const mode = getExecutionMode()

    if (mode === 'live') {
      return {
        mode,
        embeddingProvider: createLiveEmbeddingProvider(config, tokenSink),
        llmProvider: createLiveLLMProvider(config, tokenSink),
      }
    }

    return {
      mode,
      embeddingProvider: createMockEmbeddingProvider(getPreferredVectorDimension()),
      llmProvider: createMockLLMProvider(mode),
    }
  }

  function getVectorProviderState():
    | {
        mode: AIExecutionMode
        embeddingProvider: EmbeddingProvider
        indexState: VectorIndexState
      }
    | null {
    const desiredState = getDesiredVectorIndexState()

    if (!desiredState) {
      return null
    }

    const { mode, embeddingProvider } = getProviders()

    return {
      mode,
      embeddingProvider,
      indexState: desiredState,
    }
  }

  function clearRuntimeAiError(): boolean {
    const changed = lastAiError !== null
    lastAiError = null
    return changed
  }

  function rememberRuntimeAiError(error: unknown): void {
    lastAiError = error instanceof Error ? error.message : 'AI 运行失败。'
  }

  function advanceBlockEnrichGeneration(blockId: string): number {
    const nextGeneration = (blockEnrichGenerations.get(blockId) ?? 0) + 1
    blockEnrichGenerations.set(blockId, nextGeneration)
    return nextGeneration
  }

  function isCurrentBlockEnrichGeneration(blockId: string, generation: number): boolean {
    return blockEnrichGenerations.get(blockId) === generation
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

  function enqueueBlocksForVectorReindex(blocks: Array<Pick<Block, 'id' | 'updatedAt'>>): void {
    if (blocks.length === 0) {
      return
    }

    const queuedAt = new Date().toISOString()

    for (const block of blocks) {
      enqueueBlockVector(db, block.id, block.updatedAt, queuedAt)
      removeFailedBlockVector(db, block.id)
    }

    emitMetaChanged({
      reason: 'vector-queue',
    })
  }

  function scheduleCurrentVectorReindex(options: { fullRebuild?: boolean } = {}): void {
    const providerState = getVectorProviderState()

    if (!providerState || !vectorReady || currentVectorDimension === null) {
      return
    }

    const reindexAlreadyRefreshingTarget =
      Boolean(activeReindexState?.fullRebuild) && isSameVectorIndexState(activeReindexState?.indexState ?? null, providerState.indexState)
    const queuedFullRebuildForTarget =
      reindexNeedsFullRebuild && isSameVectorIndexState(reindexProviderState?.indexState ?? null, providerState.indexState)
    const needsFullRebuild =
      Boolean(options.fullRebuild) ||
      (!isSameVectorIndexState(currentVectorIndexState, providerState.indexState) &&
        !reindexAlreadyRefreshingTarget &&
        !queuedFullRebuildForTarget)

    scheduleReindex(providerState.embeddingProvider, providerState.mode, providerState.indexState, {
      fullRebuild: needsFullRebuild,
    })
  }

  async function getQueryEmbedding(query: string, mode: AIExecutionMode, embeddingProvider: EmbeddingProvider): Promise<number[] | null> {
    if (!canUseVectorSearch()) {
      return null
    }

    try {
      const embedding = (await embeddingProvider.embed([query]))[0] ?? null

      if (mode === 'live') {
        clearRuntimeAiError()
      }

      return embedding
    } catch (error) {
      if (mode === 'live') {
        rememberRuntimeAiError(error)
        emitMetaChanged({
          reason: 'vector-failure',
        })
      }

      return null
    }
  }

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

  async function reindexVectors(
    embeddingProvider: EmbeddingProvider,
    mode: AIExecutionMode,
    indexState: VectorIndexState,
    options: { fullRebuild: boolean },
  ): Promise<void> {
    if (!vectorReady || !currentVectorDimension) {
      vectorSchemaReady = false
      return
    }

    if (options.fullRebuild) {
      persistVectorIndexState(null)
      resetPendingBlockVectors(db)
    }

    try {
      while (true) {
        const jobs = listPendingBlockVectors(db, VECTOR_REINDEX_BATCH_SIZE)

        if (jobs.length === 0) {
          break
        }

        const queuedIds = jobs.map((job) => job.blockId)
        const blocks = getBlocksByIds(db, queuedIds)
        const blockMap = new Map(blocks.map((block) => [block.id, block]))
        const missingIds = queuedIds.filter((id) => !blockMap.has(id))

        if (missingIds.length > 0) {
          removePendingBlockVectors(db, missingIds)
        }

        const batch = queuedIds
          .map((id) => blockMap.get(id))
          .filter((block): block is Block => Boolean(block))

        if (batch.length === 0) {
          continue
        }

        const embeddings = await embeddingProvider.embed(batch.map((block) => block.content))
        const latestJobs = new Map(getPendingBlockVectorsByIds(db, batch.map((block) => block.id)).map((job) => [job.blockId, job]))
        const completedIds: string[] = []

        for (const [index, block] of batch.entries()) {
          const vector = embeddings[index]

          if (!vector) {
            continue
          }

          if (currentVectorDimension !== vector.length) {
            const schema = ensureVectorSchema(db, vector.length)
            currentVectorDimension = schema.currentDimension

            if (schema.changed) {
              persistVectorIndexState(null)
              vectorSchemaReady = false
              resetPendingBlockVectors(db)
            }
          }

          const latestJob = latestJobs.get(block.id)

          if (!latestJob || latestJob.contentUpdatedAt !== block.updatedAt) {
            continue
          }

          if (currentVectorDimension === vector.length) {
            upsertBlockVector(db, block.id, vector)
            completedIds.push(block.id)
          }
        }

        removePendingBlockVectors(db, completedIds)

        // 成功的块如果之前在失败记录中，移除之
        for (const id of completedIds) {
          removeFailedBlockVector(db, id)
        }
      }

      if (currentVectorDimension !== null && countPendingBlockVectors(db) === 0) {
        vectorSchemaReady = true
        persistVectorIndexState(indexState)
      }

      emitMetaChanged({
        reason: 'vector-queue',
      })
    } catch (error) {
      // 将当前 pending batch 中尚未完成的块记录到失败表
      const remainingJobs = listPendingBlockVectors(db, VECTOR_REINDEX_BATCH_SIZE)
      for (const job of remainingJobs) {
        try {
          const block = getBlockById(db, job.blockId)
          insertFailedBlockVector(db, block.id, block.content, error instanceof Error ? error.message : String(error))
        } catch {
          continue
        }
      }
      removePendingBlockVectors(db, remainingJobs.map((j) => j.blockId))

      if (mode === 'live') {
        rememberRuntimeAiError(error)
      }

      emitMetaChanged({
        reason: 'vector-failure',
      })

      throw error
    }
  }

  function scheduleReindex(
    embeddingProvider: EmbeddingProvider,
    mode: AIExecutionMode,
    indexState: VectorIndexState,
    options: { fullRebuild?: boolean } = {},
  ): void {
    if (!vectorReady || currentVectorDimension === null) {
      return
    }

    reindexRequested = true
    reindexProviderState = { embeddingProvider, mode, indexState }

    if (options.fullRebuild) {
      reindexNeedsFullRebuild = true
    }

    if (reindexTask) {
      return
    }

    const task = trackTask(
      (async () => {
        while (reindexRequested || reindexNeedsFullRebuild || countPendingBlockVectors(db) > 0) {
          const providerState = reindexProviderState ?? { embeddingProvider, mode, indexState }
          const fullRebuild = reindexNeedsFullRebuild

          reindexRequested = false
          reindexProviderState = null
          reindexNeedsFullRebuild = false
          activeReindexState = {
            indexState: providerState.indexState,
            fullRebuild,
          }

          await reindexVectors(providerState.embeddingProvider, providerState.mode, providerState.indexState, { fullRebuild })
          activeReindexState = null
        }
      })().finally(() => {
        reindexTask = null
        activeReindexState = null

        if (reindexRequested || reindexNeedsFullRebuild || countPendingBlockVectors(db) > 0) {
          const providerState = reindexProviderState ?? { embeddingProvider, mode, indexState }
          scheduleReindex(providerState.embeddingProvider, providerState.mode, providerState.indexState)
        }
      }),
    )

    reindexTask = task
  }

  function ensureSchemaForDimension(dimension: number): boolean {
    if (!vectorReady) {
      return false
    }

    const schema = ensureVectorSchema(db, dimension)
    currentVectorDimension = schema.currentDimension

    if (schema.changed) {
      persistVectorIndexState(null)
      vectorSchemaReady = false
      return true
    }

    if (currentVectorDimension !== null && reindexTask === null && countPendingBlockVectors(db) === 0) {
      vectorSchemaReady = true
    }

    return false
  }

  function ensureVectorSchemaForCurrentState(forceFullRebuild = false): void {
    if (!vectorReady) {
      return
    }

    const desiredState = getDesiredVectorIndexState()

    if (!desiredState) {
      return
    }

    const preferredDimension = getPreferredVectorDimension()
    const schemaChanged = ensureSchemaForDimension(preferredDimension)
    const pendingCount = countPendingBlockVectors(db)
    const blockCount = countBlocks(db)
    const vectorCount = blockCount > 0 ? countBlockVectors(db) : 0
    const shouldFullRebuild =
      schemaChanged ||
      forceFullRebuild ||
      !isSameVectorIndexState(currentVectorIndexState, desiredState) ||
      (pendingCount === 0 && vectorCount < blockCount)

    if (!shouldFullRebuild && pendingCount === 0) {
      return
    }

    const providerState = getVectorProviderState()

    if (!providerState) {
      return
    }

    scheduleReindex(providerState.embeddingProvider, providerState.mode, desiredState, { fullRebuild: shouldFullRebuild })
  }

  async function enrichBlock(
    blockId: string,
    content: string,
    generation: number,
  ): Promise<boolean> {
    const { mode, llmProvider } = getProviders()
    const tagMemory = getTagMemory(db)
    const assignment = await tagger.assign(content, {
      corpusContents: [content, ...listRecentBlockContents(db, TAGGER_CORPUS_LIMIT, blockId)],
      liveLlmProvider: mode === 'live' ? llmProvider : null,
      tagMemory,
    })
    const currentBlock = getFreshBlockForEnrich(blockId, generation)

    if (!currentBlock) {
      return false
    }

    const tags = [
      ...assignment.categories.map((tagName) => getOrCreateTag(db, tagName, 'category')),
      ...assignment.detailTags.map((tagName) => getOrCreateTag(db, tagName, 'detail')),
    ]
    syncAutoBlockTags(db, blockId, tags)

    if (mode === 'live') {
      clearRuntimeAiError()
    }

    const block = updateBlockState(db, {
      id: blockId,
      status: 'ready',
      aiMode: mode,
      summary: assignment.summary,
      updatedAt: currentBlock.updatedAt,
    })

    emitBlockChanged({
      block,
      reason: 'enriched',
    })

    void trackTask(syncCalendarSuggestionsForBlock(blockId, generation, llmProvider, mode))

    return true
  }

  async function runEnrichWithRetry(
    blockId: string,
    content: string,
    generation: number,
  ): Promise<boolean> {
    const aiMode = getExecutionMode()

    for (let attempt = 0; attempt <= MAX_ENRICH_RETRIES; attempt += 1) {
      try {
        return await enrichBlock(blockId, content, generation)
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
            errorMessage: error instanceof Error ? `自动重试中：${error.message}` : '自动重试中。',
          })

          emitBlockChanged({
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
          errorMessage: error instanceof Error ? error.message : '后台处理失败。',
        })

        emitBlockChanged({
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
    if (queuedEnrichTimer) {
      clearTimeout(queuedEnrichTimer)
      queuedEnrichTimer = null
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

    const { llmProvider } = getProviders()
    const batchOptions = getQueuedEnrichBatchOptions()

    for (let attempt = 0; attempt <= MAX_ENRICH_RETRIES; attempt += 1) {
      const currentRequests = getActiveQueuedEnrichRequests(requests)

      if (currentRequests.length === 0) {
        return
      }

      try {
        const assignments = await tagger.assignBatch(
          currentRequests.map((request) => ({
            content: request.content,
            options: {
              corpusContents: [request.content, ...listRecentBlockContents(db, TAGGER_CORPUS_LIMIT, request.blockId)],
              liveLlmProvider: llmProvider,
              batchOptions: {
                maxBatchBlocks: batchOptions.maxBatchBlocks,
                responseReserveTokens: batchOptions.responseReserveTokens,
              },
              tagMemory: getTagMemory(db),
            },
          })),
        )

        clearRuntimeAiError()

        for (const [index, request] of currentRequests.entries()) {
          const currentBlock = getFreshBlockForEnrich(request.blockId, request.generation)

          if (!currentBlock) {
            continue
          }

          const assignment = assignments[index]
          const tags = [
            ...assignment.categories.map((tagName) => getOrCreateTag(db, tagName, 'category')),
            ...assignment.detailTags.map((tagName) => getOrCreateTag(db, tagName, 'detail')),
          ]

          syncAutoBlockTags(db, request.blockId, tags)

          const block = updateBlockState(db, {
            id: request.blockId,
            status: 'ready',
            aiMode: 'live',
            summary: assignment.summary,
            updatedAt: currentBlock.updatedAt,
          })

          emitBlockChanged({
            block,
            reason: 'enriched',
          })

          void trackTask(syncCalendarSuggestionsForBlock(request.blockId, request.generation, llmProvider, 'live'))
        }

        return
      } catch (error) {
        const retryableRequests = getActiveQueuedEnrichRequests(requests)

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
              errorMessage: error instanceof Error ? `自动重试中：${error.message}` : '自动重试中。',
            })

            emitBlockChanged({
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
            errorMessage: error instanceof Error ? error.message : '后台处理失败。',
          })

          emitBlockChanged({
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

    while (queuedEnrichRequests.length > 0) {
      const requests = queuedEnrichRequests
      queuedEnrichRequests = []
      await runQueuedEnrichBatchWithRetry(requests)
    }
  }

  function startQueuedEnrichFlush(): void {
    clearQueuedEnrichTimer()

    if (queuedEnrichFlushTask) {
      return
    }

    const task = (async () => {
      try {
        await flushQueuedEnrichRequests()
      } finally {
        queuedEnrichFlushTask = null
      }
    })()

    queuedEnrichFlushTask = trackTask(task)
  }

  function scheduleEnrich(blockId: string, content: string, generation: number): void {
    if (!shouldUseQueuedEnrich()) {
      void trackTask(runEnrichWithRetry(blockId, content, generation))
      return
    }

    queuedEnrichRequests = [
      ...queuedEnrichRequests.filter((request) => request.blockId !== blockId),
      {
        blockId,
        content,
        generation,
      },
    ]

    const settings = getQueuedEnrichBatchOptions()

    if (queuedEnrichRequests.length >= settings.maxBatchBlocks) {
      startQueuedEnrichFlush()
      return
    }

    if (!queuedEnrichTimer) {
      queuedEnrichTimer = setTimeout(() => {
        queuedEnrichTimer = null
        startQueuedEnrichFlush()
      }, settings.queueDebounceMs)
    }
  }

  function createBlockWithAttachments(content: string, now: string, aiMode: AIExecutionMode): Block {
    const transaction = db.transaction(() => {
      const block = createBlockRecord(db, {
        id: uuid(),
        content,
        status: 'pending',
        aiMode,
        createdAt: now,
        updatedAt: now,
      })

      syncBlockAttachmentRecords(db, options.dataDirectory, block.id, content)
      removeFailedBlockVector(db, block.id)
      return block
    })

    return transaction()
  }

  function updateBlockWithAttachments(id: string, content: string, updatedAt: string, aiMode: AIExecutionMode): Block {
    const transaction = db.transaction(() => {
      const block = updateBlockContent(db, {
        id,
        content,
        status: 'pending',
        aiMode,
        updatedAt,
      })

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
      emitTouchedNotebooks(Array.from(touchedNotebookIds), 'block-unlinked')
      emitMetaChanged({
        reason: 'vector-queue',
      })

      for (const deletedBlock of deletedBlocks) {
        emitBlockChanged({
          block: deletedBlock,
          reason: 'deleted',
        })
      }

      void trackTask(cleanupOrphanAttachmentsService(db, options.dataDirectory))
    }

    return {
      deletedBlocks,
      touchedNotebookIds: Array.from(touchedNotebookIds),
    }
  }

  async function createStandaloneBlock(content: string): Promise<Block> {
    const safeContent = validateContent(content)
    const now = new Date().toISOString()
    const aiMode = getExecutionMode()
    const block = createBlockWithAttachments(safeContent, now, aiMode)
    const enrichGeneration = advanceBlockEnrichGeneration(block.id)

    emitBlockChanged({
      block,
      reason: 'created',
    })

    scheduleEnrich(block.id, safeContent, enrichGeneration)
    enqueueBlocksForVectorReindex([block])
    scheduleCurrentVectorReindex()

    return block
  }

  ensureVectorSchemaForCurrentState()

  return {
    async createBlock(content) {
      return createStandaloneBlock(content)
    },

    async getBlock(id) {
      return getBlockById(db, id)
    },

    async listBlocks(params = {}) {
      return listBlocks(db, {
        offset: params.offset ?? 0,
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
      })
    },

    async listBlocksByDate(date) {
      return listBlocksByDateInDb(db, date)
    },

    async updateBlock(id, content) {
      const safeContent = validateContent(content)
      const enrichGeneration = advanceBlockEnrichGeneration(id)
      const aiMode = getExecutionMode()
      const updatedAt = new Date().toISOString()
      const block = updateBlockWithAttachments(id, safeContent, updatedAt, aiMode)
      emitTouchedNotebooks(touchNotebooksForBlock(db, id, updatedAt), 'updated')

      emitBlockChanged({
        block,
        reason: 'updated',
      })

      scheduleEnrich(id, safeContent, enrichGeneration)
      enqueueBlocksForVectorReindex([block])
      scheduleCurrentVectorReindex()
      void trackTask(cleanupOrphanAttachmentsService(db, options.dataDirectory))

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

      emitBlockChanged({
        block,
        reason: 'tagged',
      })

      return block
    },

    async removeTag(blockId, tagId) {
      const block = removeTagFromBlock(db, blockId, tagId)
      emitTouchedNotebooks(touchNotebooksForBlock(db, blockId, new Date().toISOString()), 'updated')

      emitBlockChanged({
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

    async getGraphData(tagNames = []) {
      return loadGraphData(db, tagNames)
    },

    async searchBlocks(query, limit = 20) {
      const normalizedQuery = validateContent(query)
      const { mode, embeddingProvider } = getProviders()
      const queryEmbedding = await getQueryEmbedding(normalizedQuery, mode, embeddingProvider)

      return searchBlocksInDatabase(db, normalizedQuery, {
        limit,
        queryEmbedding,
        vectorEnabled: canUseVectorSearch() && Boolean(queryEmbedding),
      })
    },

    async searchByTag(tagName, limit = 50) {
      return searchBlocksByTag(db, tagName, limit)
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

    async saveSnapshot(topic, content, blockIds, notebookId) {
      return createSnapshot(db, validateContent(topic), content, blockIds, notebookId)
    },

    async listSnapshots(query = '', notebookId) {
      return listSnapshots(db, query, notebookId)
    },

    async getSnapshot(id) {
      return getSnapshot(db, id)
    },

    async removeSnapshot(id) {
      removeSnapshot(db, id)
    },

    async listCalendarYears() {
      return listCalendarYears(db)
    },

    async getCalendarHeatmap(year) {
      return getCalendarHeatmap(db, year)
    },

    async getCalendarDayDetail(date) {
      return getCalendarDayDetail(db, normalizeCalendarDate(date))
    },

    async listUpcomingCalendarEntries(limitDays) {
      const settings = getCalendarSettings()
      const days = Math.max(1, Math.round(limitDays ?? settings.upcomingDays))
      const startDate = todayDateKey()
      const endDateValue = new Date(`${startDate}T00:00:00`)
      endDateValue.setDate(endDateValue.getDate() + Math.max(0, days - 1))
      const endDate = [
        endDateValue.getFullYear(),
        String(endDateValue.getMonth() + 1).padStart(2, '0'),
        String(endDateValue.getDate()).padStart(2, '0'),
      ].join('-')

      return listUpcomingCalendarEntries(db, startDate, endDate)
    },

    async createCalendarEntry(input) {
      const entry = createCalendarEntry(db, normalizeCalendarEntryInput(input), new Date().toISOString())
      emitCalendarChanged({
        reason: 'entry-created',
        date: entry.date,
      })
      return entry
    },

    async updateCalendarEntry(id, patch) {
      const entry = updateCalendarEntry(db, id, normalizeCalendarEntryPatch(patch), new Date().toISOString())
      emitCalendarChanged({
        reason: 'entry-updated',
        date: entry.date,
      })
      return entry
    },

    async removeCalendarEntry(id) {
      removeCalendarEntry(db, id)
      emitCalendarChanged({
        reason: 'entry-deleted',
      })
    },

    async acceptCalendarSuggestion(id, overrides) {
      const entry = acceptCalendarSuggestion(db, id, normalizeCalendarSuggestionAcceptInput(overrides), new Date().toISOString())
      emitCalendarChanged({
        reason: 'suggestion-updated',
        date: entry.date,
        sourceBlockId: entry.linkedBlockId ?? undefined,
      })
      return entry
    },

    async dismissCalendarSuggestion(id) {
      dismissCalendarSuggestion(db, id)
      emitCalendarChanged({
        reason: 'suggestion-updated',
      })
    },

    async listNotebooks() {
      return listNotebooks(db)
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
      const safeContent = validateContent(content)
      const now = new Date().toISOString()
      const aiMode = getExecutionMode()
      const transaction = db.transaction(() => {
        ensureNotebookExists(db, notebookId)

        const block = createBlockRecord(db, {
          id: uuid(),
          content: safeContent,
          status: 'pending',
          aiMode,
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

      emitBlockChanged({
        block,
        reason: 'created',
      })
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })

      scheduleEnrich(block.id, safeContent, enrichGeneration)
      enqueueBlocksForVectorReindex([block])
      scheduleCurrentVectorReindex()

      return getNotebookById(db, notebookId)
    },

    async createNotebookStructureItem(notebookId, input) {
      const notebook = createNotebookStructureItem(db, notebookId, input, new Date().toISOString())
      emitNotebooksChanged({
        notebookIds: [notebookId],
        reason: 'items-changed',
      })
      return notebook
    },

    async updateNotebookStructureItem(notebookId, itemId, patch) {
      const notebook = updateNotebookStructureItem(db, notebookId, itemId, patch, new Date().toISOString())
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
      updateNotebookReferenceReview(db, notebookId, blockId, patch, new Date().toISOString())
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

    async exportMarkdown(exportOptions) {
      const targetDirectory =
        exportOptions.targetPath ??
        (options.chooseDirectory ? await options.chooseDirectory('选择 Markdown 导出目录') : null)

      if (!targetDirectory) {
        return null
      }

      return exportMarkdownBundle(db, targetDirectory, exportOptions)
    },

    async exportJson(exportOptions) {
      const defaultPath = join(options.dataDirectory, `changbu-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      const targetFilePath =
        exportOptions.targetPath ??
        (options.chooseSavePath
          ? await options.chooseSavePath({
              title: '导出 JSON 备份',
              defaultPath,
              filters: [{ name: 'JSON', extensions: ['json'] }],
            })
          : null)

      if (!targetFilePath) {
        return null
      }

      return exportJsonBundle(db, targetFilePath, exportOptions)
    },

    async previewImportMarkdown(filePaths) {
      const resolvedFilePaths =
        filePaths && filePaths.length > 0
          ? filePaths
          : options.chooseOpenPaths
            ? await options.chooseOpenPaths({
                title: '选择 Markdown 文件',
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile', 'multiSelections'],
              })
            : []

      if (resolvedFilePaths.length === 0) {
        return null
      }

      const { preview, job } = await previewMarkdownImport(resolvedFilePaths)
      importJobs.set(preview.importId, job)
      return preview
    },

    async previewImportJson(filePath) {
      const resolvedFilePath =
        filePath ??
        (options.chooseOpenPaths
          ? (
              await options.chooseOpenPaths({
                title: '选择 JSON 备份文件',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile'],
              })
            )[0]
          : undefined)

      if (!resolvedFilePath) {
        return null
      }

      const { preview, job } = await previewJsonImport(db, resolvedFilePath)
      importJobs.set(preview.importId, job)
      return preview
    },

    async confirmImport(importId, conflictStrategy) {
      const job = importJobs.get(importId)

      if (!job) {
        throw new Error('导入预览已失效，请重新选择文件。')
      }

      let result: Awaited<ReturnType<typeof confirmImportJob>>

      try {
        result = await confirmImportJob(db, options.dataDirectory, job, conflictStrategy)
      } finally {
        importJobs.delete(importId)
      }

      const importedBlocks = getBlocksByIds(db, result.importedIds)
      const createdBlocks = getBlocksByIds(db, result.createdIds)
      const updatedBlocks = getBlocksByIds(db, result.updatedIds)
      const touchedNotebookIds = new Set<string>()

      for (const block of updatedBlocks) {
        for (const notebookId of touchNotebooksForBlock(db, block.id, new Date().toISOString())) {
          touchedNotebookIds.add(notebookId)
        }
      }

      for (const block of createdBlocks) {
        emitBlockChanged({
          block,
          reason: 'created',
        })
      }

      for (const block of updatedBlocks) {
        emitBlockChanged({
          block,
          reason: 'updated',
        })
      }

      emitTouchedNotebooks(Array.from(touchedNotebookIds), 'updated')

      if (job.format === 'markdown') {
        void trackTask(
          (async () => {
            for (const block of importedBlocks) {
              const enrichGeneration = advanceBlockEnrichGeneration(block.id)
              scheduleEnrich(block.id, block.content, enrichGeneration)
            }
          })(),
        )
      }

      enqueueBlocksForVectorReindex(importedBlocks)
      scheduleCurrentVectorReindex()

      void trackTask(cleanupOrphanAttachmentsService(db, options.dataDirectory))
      return result
    },

    async getDataManagementOverview() {
      const config = getSavedConfig()
      const pendingVectorCount = countPendingBlockVectors(db)
      const tokenUsage = getTokenUsage()
      const totalNotebookCount = (db.prepare(`SELECT COUNT(*) AS total FROM notebooks`).get() as { total: number }).total
      const totalSnapshotCount = (db.prepare(`SELECT COUNT(*) AS total FROM snapshots`).get() as { total: number }).total
      const totalAttachmentCount = (db.prepare(`SELECT COUNT(*) AS total FROM attachments`).get() as { total: number }).total

      return {
        dataDirectory: options.dataDirectory,
        databasePath,
        settingsDirectory: dirname(settingsStore.filePath),
        settingsFilePath: settingsStore.filePath,
        totalBlockCount: countBlocks(db),
        totalNotebookCount,
        totalSnapshotCount,
        totalAttachmentCount,
        totalVectorCount: vectorReady && currentVectorDimension !== null ? countBlockVectors(db) : 0,
        vectorReady,
        aiConfigured: isAIConfigured(config),
        activeAiMode: getExecutionMode(),
        vectorDimension: currentVectorDimension,
        vectorSchemaReady: vectorReady && vectorSchemaReady,
        failedVectorCount: countFailedBlockVectors(db),
        pendingVectorCount,
        vectorQueueProcessing: Boolean(reindexTask || activeReindexState) && pendingVectorCount > 0,
        tokenUsage: tokenUsage.requestCount > 0 ? tokenUsage : null,
      }
    },

    async cleanupOrphanAttachments() {
      const removedCount = await trackTask(cleanupOrphanAttachmentsService(db, options.dataDirectory))

      emitMetaChanged({
        reason: 'data-management',
      })

      return { removedCount }
    },

    async rebuildAttachmentIndex() {
      const result = await trackTask(rebuildAttachmentIndexService(db, options.dataDirectory))

      emitMetaChanged({
        reason: 'data-management',
      })

      return result
    },

    async rebuildAllVectors() {
      if (!vectorReady || currentVectorDimension === null) {
        throw new Error('当前向量索引不可用，无法重建。')
      }

      const providerState = getVectorProviderState()

      if (!providerState) {
        throw new Error('当前 AI / 向量配置尚未就绪，请先完成 API 测试或改用 mock。')
      }

      const queuedBlockCount = countBlocks(db)

      clearFailedBlockVectors(db)
      resetPendingBlockVectors(db)
      scheduleReindex(providerState.embeddingProvider, providerState.mode, providerState.indexState, {
        fullRebuild: true,
      })

      emitMetaChanged({
        reason: 'data-management',
      })

      return {
        queuedBlockCount,
      }
    },

    async getSetting(key) {
      return FILE_BACKED_SETTING_KEYS.has(key) ? settingsStore.get(key) : getDbSetting(db, key)
    },

    async setSetting(key, value) {
      const previousValue = FILE_BACKED_SETTING_KEYS.has(key) ? settingsStore.get(key) : getDbSetting(db, key)

      if (FILE_BACKED_SETTING_KEYS.has(key)) {
        settingsStore.set(key, value)
      } else {
        setDbSetting(db, key, value)
      }

      if (key === 'ai_config' && previousValue !== value) {
        const savedConfig = getSavedConfig()
        const savedFingerprint = isAIConfigured(savedConfig) ? createConfigFingerprint(savedConfig) : null
        const lastTestResult = getLastAiTestResult()

        if (!savedFingerprint || lastTestResult?.configFingerprint !== savedFingerprint) {
          settingsStore.set(AI_LAST_TEST_RESULT_KEY, '')
        }

        clearRuntimeAiError()

        if (!isAIConfigured(savedConfig)) {
          ensureVectorSchemaForCurrentState(true)
        }
      }

      if ((key === 'ai_config' || key === BLOCK_ENRICH_SETTINGS_KEY) && queuedEnrichRequests.length > 0) {
        startQueuedEnrichFlush()
      }

      if (key === CALENDAR_SETTINGS_KEY) {
        const calendarSettings = getCalendarSettings()

        if (!calendarSettings.aiSuggestionsEnabled) {
          db.prepare(`DELETE FROM calendar_suggestions`).run()
          emitCalendarChanged({
            reason: 'suggestion-updated',
          })
        }
      }

      emitMetaChanged({
        reason: 'settings',
      })
    },

    async testApi(config) {
      const result = await probeAiConfig(config)
      settingsStore.set(AI_LAST_TEST_RESULT_KEY, JSON.stringify(result))

      if (vectorReady && result.success && result.embeddingDimension) {
        const schemaChanged = ensureSchemaForDimension(result.embeddingDimension)
        const configFingerprint = result.configFingerprint ?? createConfigFingerprint(config)
        const targetState = createLiveVectorIndexState(configFingerprint)
        const embeddingProvider = createLiveEmbeddingProvider(config, tokenSink)
        scheduleReindex(embeddingProvider, 'live', targetState, {
          fullRebuild: schemaChanged || !isSameVectorIndexState(currentVectorIndexState, targetState),
        })
      }

      emitMetaChanged({
        reason: 'ai-test',
      })

      return result
    },

    async getMeta() {
      const config = getSavedConfig()
      const lastAiTestResult = getLastAiTestResult()
      const savedFingerprint = getSavedConfigFingerprint()
      const activeAiMode =
        isAIConfigured(config) && lastAiTestResult?.success && Boolean(savedFingerprint) && lastAiTestResult.configFingerprint === savedFingerprint
          ? 'live'
          : 'mock'
      const pendingVectorCount = countPendingBlockVectors(db)

      const tokenUsage = getTokenUsage()
      const lifetimeTokenUsage = getLifetimeTokenUsage()

      return {
        dataDirectory: options.dataDirectory,
        totalBlockCount: countBlocks(db),
        vectorReady,
        aiConfigured: isAIConfigured(config),
        resolvedBaseUrl: isAIConfigured(config) ? resolveBaseUrl(config.llm.endpoint || config.embedding.endpoint) : null,
        vectorDimension: currentVectorDimension,
        vectorSchemaReady: vectorReady && vectorSchemaReady,
        activeAiMode,
        lastAiError,
        lastAiTestResult,
        modelCallCounts: getModelCallCounts(),
        tokenUsage: tokenUsage.requestCount > 0 ? tokenUsage : null,
        lifetimeTokenUsage: lifetimeTokenUsage.requestCount > 0 ? lifetimeTokenUsage : null,
        failedVectorCount: countFailedBlockVectors(db),
        pendingVectorCount,
        vectorQueueProcessing: Boolean(reindexTask || activeReindexState) && pendingVectorCount > 0,
      }
    },

    async retryFailedVectors(): Promise<number> {
      const failed = listFailedBlockVectors(db)

      if (failed.length === 0) {
        return 0
      }

      const now = new Date().toISOString()
      for (const record of failed) {
        try {
          const block = getBlockById(db, record.blockId)
          enqueueBlockVector(db, record.blockId, block.updatedAt, now)
        } catch {
          continue
        }
      }

      clearFailedBlockVectors(db)

      scheduleCurrentVectorReindex()
      emitMetaChanged({
        reason: 'vector-retry',
      })

      return failed.length
    },

    async openDataDirectory() {
      if (!options.openPath) {
        return
      }

      const openResult = await options.openPath(options.dataDirectory)

      if (openResult) {
        throw new Error(openResult)
      }
    },

    async openSettingsDirectory() {
      if (!options.openPath) {
        return
      }

      const openResult = await options.openPath(dirname(settingsStore.filePath))

      if (openResult) {
        throw new Error(openResult)
      }
    },

    async whenIdle() {
      if (queuedEnrichRequests.length > 0 || queuedEnrichTimer) {
        startQueuedEnrichFlush()
      }

      while (pendingTasks.size > 0 || queuedEnrichRequests.length > 0 || queuedEnrichFlushTask) {
        if (!queuedEnrichFlushTask && queuedEnrichRequests.length > 0) {
          startQueuedEnrichFlush()
        }

        await Promise.allSettled(Array.from(pendingTasks))
      }
    },

    dispose() {
      clearQueuedEnrichTimer()
      db.close()
    },
  }
}
