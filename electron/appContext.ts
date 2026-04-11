/**
 * AppContext 工厂入口 —— 组装各领域模块
 *
 * 仅负责：
 * 1. 数据库、设置文件、tagger 初始化
 * 2. 共享可变状态声明与 getter/setter 对创建
 * 3. 按依赖顺序调用各领域工厂
 * 4. 组装返回完整的 AppContext 实现
 */

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

import Database from 'better-sqlite3'

import { BLOCK_ENRICH_SETTINGS_KEY, CALENDAR_SETTINGS_KEY, DOC_GENERATION_SETTINGS_KEY, EXTERNAL_ACCESS_SETTINGS_KEY, UI_SETTINGS_KEY, parseBlockEnrichSettings, parseCalendarSettings, parseDocGenerationSettings, parseExternalAccessSettings, parseUISettings } from '../shared/config'
import type { AIConfig, ApiTestResult, Block } from '../shared/types'
import { initializeDatabase } from './db'
import { getSetting as getDbSetting, parseAIConfig } from './db/settings'
import { createSettingsFileStore, resolveSettingsFilePath } from './settingsFile'
import { createTaggerEngine } from './services/tagger'
import { createContextEventEmitters, createPendingTaskTracker, createUsageTracker, parseTokenUsage } from './appContext-runtime'
import type { AppContext, AppContextOptions, QueuedEnrichRequest, VectorIndexState } from './appContext-types'
import { createSearchModule, type SearchModule } from './appContext-search'
import { createVectorModule, type VectorModule } from './appContext-vectors'
import { createEnrichModule, type EnrichModule } from './appContext-enrich'
import { createBlockModule, type BlockModule } from './appContext-blocks'
import { createCalendarModule, type CalendarModule } from './appContext-calendar'
import { createNotebookModule, type NotebookModule } from './appContext-notebooks'
import { createImportExportModule, type ImportExportModule } from './appContext-importExport'
import { createSettingsModule, type SettingsModule } from './appContext-settings'
import { validateContent } from './appContext-utils'
import { createSnapshot, getSnapshot, listSnapshots, removeSnapshot, updateSnapshot as updateSnapshotInDb } from './db/snapshots'


export type { AppContext, AppContextOptions, VectorIndexState, QueuedEnrichRequest } from './appContext-types'

const AI_LAST_TEST_RESULT_KEY = 'ai_last_test_result'
const TOKEN_USAGE_TOTALS_KEY = 'token_usage_totals'
const VECTOR_INDEX_STATE_KEY = 'vector_index_state'
const BACKGROUND_PROCESSING_PAUSED_KEY = 'background_processing_paused'
const FILE_BACKED_SETTING_KEYS = new Set([
  'ai_config',
  AI_LAST_TEST_RESULT_KEY,
  TOKEN_USAGE_TOTALS_KEY,
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DOC_GENERATION_SETTINGS_KEY,
  EXTERNAL_ACCESS_SETTINGS_KEY,
  UI_SETTINGS_KEY,
])

export function createAppContext(options: AppContextOptions): AppContext {
  mkdirSync(options.dataDirectory, { recursive: true })

  // ─── 基础初始化 ─────────────────────────────────────────────────────────────
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
  const pendingTaskTracker = createPendingTaskTracker()
  const { trackTask } = pendingTaskTracker
  const { emitBlockChanged, emitNotebooksChanged, emitMetaChanged, emitCalendarChanged, emitDocGenerationChunk, emitReviewGenerationChunk } = createContextEventEmitters(options)
  const emitMetaChangedWide = emitMetaChanged as (event: { reason: string }) => void
  const usageTracker = createUsageTracker({
    emitMetaChanged,
    initialLifetimeUsage: parseTokenUsage(settingsStore.get(TOKEN_USAGE_TOTALS_KEY)),
    persistLifetimeUsage(usage) {
      settingsStore.set(TOKEN_USAGE_TOTALS_KEY, JSON.stringify(usage))
    },
  })
  const { tokenSink } = usageTracker

  // ─── 可变状态 ───────────────────────────────────────────────────────────────
  const blockEnrichGenerations = new Map<string, number>()
  let queuedEnrichRequests: QueuedEnrichRequest[] = []
  let queuedEnrichTimer: ReturnType<typeof setTimeout> | null = null
  let queuedEnrichFlushTask: Promise<void> | null = null
  let reindexTask: Promise<void> | null = null
  let vectorSchemaReady = false
  let currentVectorDimension: number | null = vectorReady ? (() => { try { return (db.prepare(`SELECT dimension FROM vector_schema LIMIT 1`).get() as { dimension: number | null } | undefined)?.dimension ?? null } catch { return null } })() : null
  vectorSchemaReady = vectorReady && currentVectorDimension !== null
  let currentVectorIndexState = (() => {
    const raw = getDbSetting(db, VECTOR_INDEX_STATE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as VectorIndexState
    } catch {
      return null
    }
  })()
  let activeReindexState: { indexState: VectorIndexState; fullRebuild: boolean } | null = null
  let lastAiError: string | null = null
  let startupRecoveredBlockCount = 0
  let disposed = false
  let dbClosed = false

  // ─── 共享辅助函数 ───────────────────────────────────────────────────────────
  function getSavedConfig(): AIConfig {
    return parseAIConfig(settingsStore.get('ai_config'))
  }

  function getLastAiTestResult(): ApiTestResult | null {
    const raw = settingsStore.get(AI_LAST_TEST_RESULT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ApiTestResult
    } catch {
      return null
    }
  }

  function getBlockEnrichSettings() {
    return parseBlockEnrichSettings(settingsStore.get(BLOCK_ENRICH_SETTINGS_KEY))
  }

  function getCalendarSettings() {
    return parseCalendarSettings(settingsStore.get(CALENDAR_SETTINGS_KEY))
  }

  function getDocGenerationSettings() {
    return parseDocGenerationSettings(settingsStore.get(DOC_GENERATION_SETTINGS_KEY))
  }

  function getUiSettings() {
    return parseUISettings(settingsStore.get(UI_SETTINGS_KEY))
  }

  function hasEquivalentAiTransport(left: AIConfig, right: AIConfig): boolean {
    return left.llm.endpoint.trim() === right.llm.endpoint.trim()
      && left.llm.apiKey.trim() === right.llm.apiKey.trim()
      && left.llm.model.trim() === right.llm.model.trim()
      && left.embedding.endpoint.trim() === right.embedding.endpoint.trim()
      && left.embedding.apiKey.trim() === right.embedding.apiKey.trim()
      && left.embedding.model.trim() === right.embedding.model.trim()
  }

  function getExternalAccessSettings() {
    return parseExternalAccessSettings(settingsStore.get(EXTERNAL_ACCESS_SETTINGS_KEY))
  }

  function getExternalAccessOptions() {
    return {
      settingsFilePath: settingsStore.filePath,
      cliLaunchSpec: options.cliLaunchSpec ?? {
        executablePath: process.execPath,
        args: process.argv[1] ? [process.argv[1]] : [],
      },
      skillRootDirectory: options.externalSkillRootDirectory,
    }
  }

  function t(zh: string, en: string): string {
    return getUiSettings().language === 'en' ? en : zh
  }

  function clearRuntimeAiError(): boolean {
    const changed = lastAiError !== null
    lastAiError = null
    return changed
  }

  function rememberRuntimeAiError(error: unknown): void {
    lastAiError = error instanceof Error ? error.message : t('AI 运行失败。', 'AI runtime failed.')
  }

  // ─── 模块组装：按依赖顺序 ───────────────────────────────────────────────────

  // 1. Search 模块（无跨域依赖）
  let searchModule: SearchModule
  const emitBlockChangedWithDerivedInvalidation = (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => {
    searchModule.markSearchCachesDirty(event)
    searchModule.markGraphCachesDirty()
    emitBlockChanged(event)
  }

  // 2. Vectors 模块（依赖 search 的 markSearchCachesDirty）
  let vectorModule: VectorModule

  // 3. Enrich 模块（依赖 vectors）
  let enrichModule: EnrichModule

  // 4. Blocks 模块（依赖 enrich + vectors）
  let blockModule: BlockModule

  // 5. Calendar 模块
  const dailyReviewCache = new Map<string, Awaited<ReturnType<typeof import('./services/review').generateDailyReview>>>()
  const aiInsightCache = new Map<string, Awaited<ReturnType<typeof import('./services/review').generateAiInsight>>>()
  let calendarModule: CalendarModule

  // 6. Notebooks 模块
  let notebookModule: NotebookModule

  // 7. ImportExport 模块
  const importJobs = new Map<string, Awaited<ReturnType<typeof import('./services/importExport').previewMarkdownImport>>['job']>()
  let importExportModule: ImportExportModule

  // 8. Settings 模块
  let settingsModule: SettingsModule

  // ─── 工厂调用（顺序很重要）────────────────────────────────────────────────────

  // 初始化 search 模块（需要 getProviders、canUseVectorSearch、getQueryEmbedding、getCurrentVectorIndexState）
  // 但这些函数在 vector 模块中定义，所以先创建占位符
  let _vectorModuleRef: VectorModule | null = null

  searchModule = createSearchModule({
    db,
    getProviders: () => _vectorModuleRef!.getProviders(),
    canUseVectorSearch: () => _vectorModuleRef!.canUseVectorSearch(),
    getQueryEmbedding: (q, m, p) => _vectorModuleRef!.getQueryEmbedding(q, m, p!),
    getCurrentVectorIndexState: () => currentVectorIndexState,
    validateContent,
    getUiSettings,
    emitBlockChanged,
  })

  vectorModule = createVectorModule({
    db,
    vectorReady,
    emitMetaChanged: emitMetaChangedWide,
    emitBlockChangedWithDerivedInvalidation,
    trackTask,
    markSearchCachesDirty: () => searchModule.markSearchCachesDirty(),
    getSavedConfig,
    getLastAiTestResult,
    getUiSettings,
    isBackgroundProcessingPaused: () => disposed || getDbSetting(db, BACKGROUND_PROCESSING_PAUSED_KEY) === '1',
    clearRuntimeAiError,
    rememberRuntimeAiError,
    tokenSink,
    getVectorSchemaReady: () => vectorSchemaReady,
    setVectorSchemaReady: (v: boolean) => { vectorSchemaReady = v },
    getCurrentVectorDimension: () => currentVectorDimension,
    setCurrentVectorDimension: (v: number | null) => { currentVectorDimension = v },
    getCurrentVectorIndexState: () => currentVectorIndexState,
    setCurrentVectorIndexState: (v) => { currentVectorIndexState = v },
    getReindexTask: () => reindexTask,
    setReindexTask: (v) => { reindexTask = v },
    getActiveReindexState: () => activeReindexState,
    setActiveReindexState: (v) => { activeReindexState = v },
  })
  _vectorModuleRef = vectorModule
  const clearDailyReviewCache = () => {
    dailyReviewCache.clear()
    aiInsightCache.clear()
  }

  enrichModule = createEnrichModule({
    db,
    options,
    tagger,
    emitBlockChangedWithDerivedInvalidation,
    emitMetaChanged: emitMetaChangedWide,
    emitCalendarChanged,
    trackTask,
    getProviders: () => vectorModule.getProviders(),
    getSavedConfig,
    getExecutionMode: () => vectorModule.getExecutionMode(),
    getBlockEnrichSettings,
    getCalendarSettings,
    getUiSettings,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    t,
    enqueueBlocksForVectorReindex: (blocks) => vectorModule.enqueueBlocksForVectorReindex(blocks),
    scheduleCurrentVectorReindex: (opts) => vectorModule.scheduleCurrentVectorReindex(opts),
    getDisposed: () => disposed,
    getBlockEnrichGenerations: () => blockEnrichGenerations,
    getQueuedEnrichRequests: () => queuedEnrichRequests,
    setQueuedEnrichRequests: (v) => { queuedEnrichRequests = v },
    getQueuedEnrichTimer: () => queuedEnrichTimer,
    setQueuedEnrichTimer: (v) => { queuedEnrichTimer = v },
    getQueuedEnrichFlushTask: () => queuedEnrichFlushTask,
    setQueuedEnrichFlushTask: (v) => { queuedEnrichFlushTask = v },
  })

  blockModule = createBlockModule({
    db,
    options,
    vectorReady,
    emitBlockChangedWithDerivedInvalidation,
    emitTouchedNotebooks: (ids: string[], reason: string) => emitNotebooksChanged({ notebookIds: ids, reason } as import('../shared/types').NotebookChangedEvent),
    emitMetaChanged: emitMetaChangedWide,
    trackTask,
    getExecutionMode: () => vectorModule.getExecutionMode(),
    getUiSettings,
    clearDailyReviewCache,
    scheduleEnrich: (id, c, g) => enrichModule.scheduleEnrich(id, c, g),
    advanceBlockEnrichGeneration: (id) => enrichModule.advanceBlockEnrichGeneration(id),
    getBlockProcessingDecision: (c) => enrichModule.getBlockProcessingDecision(c),
    buildInitialBlockState: (c, m) => enrichModule.buildInitialBlockState(c, m),
    enqueueBlocksForVectorReindex: (blocks) => vectorModule.enqueueBlocksForVectorReindex(blocks),
    scheduleCurrentVectorReindex: (opts) => vectorModule.scheduleCurrentVectorReindex(opts),
    getQueuedEnrichRequests: () => queuedEnrichRequests,
    setQueuedEnrichRequests: (v) => { queuedEnrichRequests = v },
    getDisposed: () => disposed,
  })

  calendarModule = createCalendarModule({
    db,
    emitCalendarChanged: emitCalendarChanged as (event: { reason: string; date?: string; sourceBlockId?: string }) => void,
    emitMetaChanged: emitMetaChangedWide,
    emitReviewGenerationChunk,
    trackTask,
    getProviders: () => vectorModule.getProviders(),
    getCalendarSettings,
    getUiSettings,
    getExecutionMode: () => vectorModule.getExecutionMode(),
    clearRuntimeAiError,
    rememberRuntimeAiError,
    t,
    getSavedConfigFingerprint: () => vectorModule.getSavedConfigFingerprint(),
    dailyReviewCache,
    aiInsightCache,
  })

  notebookModule = createNotebookModule({
    db,
    options,
    emitNotebooksChanged: (event) => emitNotebooksChanged(event),
    emitMetaChanged: emitMetaChangedWide,
    emitDocGenerationChunk,
    emitBlockChangedWithDerivedInvalidation,
    trackTask,
    getProviders: () => vectorModule.getProviders(),
    getQueryEmbedding: (q, m, p) => vectorModule.getQueryEmbedding(q, m, p),
    canUseVectorSearch: () => vectorModule.canUseVectorSearch(),
    getDocGenerationSettings,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    validateContent,
    getExecutionMode: () => vectorModule.getExecutionMode(),
    getUiSettings,
    clearDailyReviewCache,
    scheduleEnrich: (id, c, g) => enrichModule.scheduleEnrich(id, c, g),
    advanceBlockEnrichGeneration: (id) => enrichModule.advanceBlockEnrichGeneration(id),
    enqueueBlocksForVectorReindex: (blocks) => vectorModule.enqueueBlocksForVectorReindex(blocks),
    scheduleCurrentVectorReindex: (opts) => vectorModule.scheduleCurrentVectorReindex(opts),
    buildInitialBlockState: (c, m) => enrichModule.buildInitialBlockState(c, m),
  })

  importExportModule = createImportExportModule({
    db,
    options,
    settingsStore,
    emitBlockChangedWithDerivedInvalidation,
    emitTouchedNotebooks: (ids: string[], reason: string) => emitNotebooksChanged({ notebookIds: ids, reason } as import('../shared/types').NotebookChangedEvent),
    emitMetaChanged: emitMetaChangedWide,
    trackTask,
    getUiSettings,
    getBlockProcessingDecision: (c) => enrichModule.getBlockProcessingDecision(c),
    scheduleEnrich: (id, c, g) => enrichModule.scheduleEnrich(id, c, g),
    advanceBlockEnrichGeneration: (id) => enrichModule.advanceBlockEnrichGeneration(id),
    enqueueBlocksForVectorReindex: (blocks) => vectorModule.enqueueBlocksForVectorReindex(blocks),
    scheduleCurrentVectorReindex: (opts) => vectorModule.scheduleCurrentVectorReindex(opts),
    t,
    importJobs,
    vectorReady,
  })

  settingsModule = createSettingsModule({
    db,
    options,
    settingsStore,
    vectorReady,
    emitMetaChanged,
    tokenSink,
    databasePath,
    getExecutionMode: () => vectorModule.getExecutionMode(),
    getUiSettings,
    getSavedConfig,
    getSavedConfigFingerprint: () => vectorModule.getSavedConfigFingerprint(),
    hasEquivalentAiTransport,
    getLastAiTestResult,
    getExternalAccessSettings,
    getExternalAccessOptions,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    t,
    clearDailyReviewCache,
    isBackgroundProcessingPaused: () => enrichModule.isBackgroundProcessingPaused(),
    countBlocksByStatus: (s) => enrichModule.countBlocksByStatus(s),
    countOversizedSkippedBlocks: () => enrichModule.countOversizedSkippedBlocks(),
    getBlockProcessingDecision: (c) => enrichModule.getBlockProcessingDecision(c),
    clearQueuedEnrichTimer: () => enrichModule.clearQueuedEnrichTimer(),
    startQueuedEnrichFlush: () => enrichModule.startQueuedEnrichFlush(),
    getQueuedEnrichRequests: () => queuedEnrichRequests,
    resumeBackgroundProcessingBacklog: () => enrichModule.resumeBackgroundProcessingBacklog(),
    scheduleBlocksForImageAnalysisRefresh: (ids) => enrichModule.scheduleBlocksForImageAnalysisRefresh(ids),
    clearBlocksImageAnalysisDerivedState: (ids) => enrichModule.clearBlocksImageAnalysisDerivedState(ids),
    emitBlockChangedWithDerivedInvalidation,
    enqueueBlocksForVectorReindex: (blocks) => vectorModule.enqueueBlocksForVectorReindex(blocks),
    scheduleCurrentVectorReindex: (opts) => vectorModule.scheduleCurrentVectorReindex(opts),
    emitCalendarChanged,
    getCalendarSettings,
    getCurrentVectorDimension: () => currentVectorDimension,
    getVectorSchemaReady: () => vectorSchemaReady,
    getReindexTask: () => reindexTask,
    getActiveReindexState: () => activeReindexState,
    getStartupRecoveredBlockCount: () => startupRecoveredBlockCount,
    getCurrentVectorIndexState: () => currentVectorIndexState,
    ensureSchemaForDimension: (d) => vectorModule.ensureSchemaForDimension(d),
    scheduleReindex: (ep, m, is, opts) => vectorModule.scheduleReindex(ep, m, is, opts),
    ensureVectorSchemaForCurrentState: (f) => vectorModule.ensureVectorSchemaForCurrentState(f),
    persistVectorIndexState: (s) => vectorModule.persistVectorIndexState(s),
    getDesiredVectorIndexState: () => vectorModule.getDesiredVectorIndexState(),
    isVectorIndexCompatible: (s) => vectorModule.isVectorIndexCompatible(s),
    getVectorProviderState: () => vectorModule.getVectorProviderState(),
    setQueuedEnrichRequests: (v: import('./appContext-types').QueuedEnrichRequest[]) => { queuedEnrichRequests = v },
    markSearchCachesDirty: () => searchModule.markSearchCachesDirty(),
    getTokenUsage: () => usageTracker.getTokenUsage(),
    getLifetimeTokenUsage: () => usageTracker.getLifetimeTokenUsage(),
    getModelCallCounts: () => usageTracker.getModelCallCounts(),
    getLastAiError: () => lastAiError,
    pendingTasks: pendingTaskTracker.pendingTasks,
    queuedEnrichFlushTask,
    setQueuedEnrichFlushTask: (v) => { queuedEnrichFlushTask = v },
    setDisposed: (v) => { disposed = v },
    getDisposed: () => disposed,
    setDbClosed: (v) => { dbClosed = v },
    getDbClosed: () => dbClosed,
    trackTask,
  })

  // ─── 启动恢复 ─────────────────────────────────────────────────────────────────
  startupRecoveredBlockCount = enrichModule.recoverOversizedPendingBlocksOnStartup()
  vectorModule.ensureVectorSchemaForCurrentState()

  // ─── 返回组装后的 AppContext ─────────────────────────────────────────────────
  return {
    createBlock: (content) => blockModule.createBlock(content),
    getBlock: (id) => blockModule.getBlock(id),
    getBlocks: (ids) => blockModule.getBlocks(ids),
    getBlockContext: (id, opts) => blockModule.getBlockContext(id, opts),
    listBlocks: (params) => blockModule.listBlocks(params),
    listBlocksByDate: (date) => blockModule.listBlocksByDate(date),
    updateBlock: (id, content) => blockModule.updateBlock(id, content),
    removeBlock: (id) => blockModule.removeBlock(id),
    removeBlocks: (ids) => blockModule.removeBlocks(ids),
    findRelatedBlocks: (blockId, limit) => blockModule.findRelatedBlocks(blockId, limit),
    addTag: (blockId, tagName) => blockModule.addTag(blockId, tagName),
    removeTag: (blockId, tagId) => blockModule.removeTag(blockId, tagId),
    listTags: (query) => blockModule.listTags(query),
    saveImage: (dataUrl, filenameHint) => blockModule.saveImage(dataUrl, filenameHint),
    getGraphData: (tagNames) => searchModule.getGraphData(tagNames),
    searchBlocks: (query, limit) => searchModule.searchBlocks(query, limit),
    searchByTag: (tagName, limit) => searchModule.searchByTag(tagName, limit),
    generateDocument: (topic) => notebookModule.generateDocument(topic),
    saveSnapshot: async (topic, content, blockIds, notebookId) => createSnapshot(
      db,
      validateContent(topic),
      validateContent(content),
      blockIds,
      notebookId ?? null,
    ),
    updateSnapshot: async (id, patch) => updateSnapshotInDb(
      db,
      id,
      {
        topic: validateContent(patch.topic),
        content: validateContent(patch.content),
      },
      new Date().toISOString(),
    ),
    listSnapshots: async (query, notebookId) => listSnapshots(db, query ?? '', notebookId),
    getSnapshot: async (id) => getSnapshot(db, id),
    removeSnapshot: async (id) => { removeSnapshot(db, id) },
    listCalendarYears: () => calendarModule.listCalendarYears(),
    getCalendarHeatmap: (year) => calendarModule.getCalendarHeatmap(year),
    getCalendarDayDetail: (date) => calendarModule.getCalendarDayDetail(date),
    generateDailyReview: (dateKey, forceRefresh) => calendarModule.generateDailyReview(dateKey, forceRefresh),
    generateAiInsight: (methodId, dateKey, forceRefresh) => calendarModule.generateAiInsight(methodId, dateKey, forceRefresh),
    listAiInsightHistory: (methodId, limit) => calendarModule.listAiInsightHistory(methodId, limit),
    startDailyReviewGeneration: (dateKey, forceRefresh) => calendarModule.startDailyReviewGeneration(dateKey, forceRefresh),
    startAiInsightGeneration: (methodId, dateKey, forceRefresh) => calendarModule.startAiInsightGeneration(methodId, dateKey, forceRefresh),
    saveDailyReviewSnapshot: (input) => calendarModule.saveDailyReviewSnapshot(input),
    saveAiInsightSnapshot: (input) => calendarModule.saveAiInsightSnapshot(input),
    listUpcomingCalendarEntries: (limitDays) => calendarModule.listUpcomingCalendarEntries(limitDays),
    createCalendarEntry: (input) => calendarModule.createCalendarEntry(input),
    updateCalendarEntry: (id, patch) => calendarModule.updateCalendarEntry(id, patch),
    removeCalendarEntry: (id) => calendarModule.removeCalendarEntry(id),
    acceptCalendarSuggestion: (id, overrides) => calendarModule.acceptCalendarSuggestion(id, overrides),
    dismissCalendarSuggestion: (id) => calendarModule.dismissCalendarSuggestion(id),
    listNotebooks: () => notebookModule.listNotebooks(),
    getNotebook: (id) => notebookModule.getNotebook(id),
    createNotebook: (title) => notebookModule.createNotebook(title),
    updateNotebook: (id, title) => notebookModule.updateNotebook(id, title),
    removeNotebook: (id) => notebookModule.removeNotebook(id),
    addBlockToNotebook: (notebookId, blockId) => notebookModule.addBlockToNotebook(notebookId, blockId),
    removeNotebookItem: (notebookId, itemId) => notebookModule.removeNotebookItem(notebookId, itemId),
    reorderNotebookItems: (notebookId, itemIds) => notebookModule.reorderNotebookItems(notebookId, itemIds),
    createNotebookBlock: (notebookId, content) => notebookModule.createNotebookBlock(notebookId, content),
    createNotebookStructureItem: (notebookId, input) => notebookModule.createNotebookStructureItem(notebookId, input),
    updateNotebookStructureItem: (notebookId, itemId, patch) => notebookModule.updateNotebookStructureItem(notebookId, itemId, patch),
    getNotebookReferencePreview: (notebookId, topic) => notebookModule.getNotebookReferencePreview(notebookId, topic),
    updateNotebookReferenceReview: (notebookId, blockId, patch, topic) => notebookModule.updateNotebookReferenceReview(notebookId, blockId, patch, topic),
    generateNotebookDocument: (notebookId, topic) => notebookModule.generateNotebookDocument(notebookId, topic),
    exportMarkdown: (exportOptions) => importExportModule.exportMarkdown(exportOptions),
    exportJson: (exportOptions) => importExportModule.exportJson(exportOptions),
    previewImportMarkdown: (filePaths) => importExportModule.previewImportMarkdown(filePaths),
    previewImportJson: (filePath) => importExportModule.previewImportJson(filePath),
    confirmImport: (importId, conflictStrategy) => importExportModule.confirmImport(importId, conflictStrategy),
    getDataManagementOverview: () => settingsModule.getDataManagementOverview(),
    cleanupOrphanAttachments: () => settingsModule.cleanupOrphanAttachments(),
    rebuildAttachmentIndex: () => settingsModule.rebuildAttachmentIndex(),
    rebuildAllVectors: () => settingsModule.rebuildAllVectors(),
    setBackgroundProcessingPaused: (paused) => settingsModule.setBackgroundProcessingPaused(paused),
    clearPendingVectors: () => settingsModule.clearPendingVectors(),
    clearFailedVectors: () => settingsModule.clearFailedVectors(),
    getSetting: (key) => settingsModule.getSetting(key),
    setSetting: (key, value) => settingsModule.setSetting(key, value),
    testApi: (config) => settingsModule.testApi(config),
    getMeta: () => settingsModule.getMeta(),
    openDataDirectory: () => settingsModule.openDataDirectory(),
    openSettingsDirectory: () => settingsModule.openSettingsDirectory(),
    getExternalAccessStatus: () => settingsModule.getExternalAccessStatus(),
    enableExternalAccess: () => settingsModule.enableExternalAccess(),
    generateExternalAccessBundle: () => settingsModule.generateExternalAccessBundle(),
    setupExternalAccess: () => settingsModule.setupExternalAccess(),
    disableExternalAccess: () => settingsModule.disableExternalAccess(),
    openExternalAccessDirectory: () => settingsModule.openExternalAccessDirectory(),
    retryFailedVectors: () => settingsModule.retryFailedVectors(),
    whenIdle: () => settingsModule.whenIdle(),
    dispose: () => settingsModule.dispose(),
  }
}
