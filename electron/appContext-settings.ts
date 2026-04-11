/**
 * 设置、元数据与外部访问模块
 *
 * 提供设置读写、API 测试、元数据查询、数据管理操作、
 * 向量维护操作、外部访问管理、生命周期管理等公共方法。
 */

import { dirname } from 'node:path'

import type {
  AIConfig,
  AIExecutionMode,
  ApiTestResult,
  AppLanguage,
  Block,
  ModelCallCounts,
} from '../shared/types'
import {
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  EXTERNAL_ACCESS_SETTINGS_KEY,
  UI_SETTINGS_KEY,
} from '../shared/config'
import {
  countBlockVectors,
  countPendingBlockVectors,
  countFailedBlockVectors,
  clearFailedBlockVectors,
  listFailedBlockVectors,
  enqueueBlockVector,
} from './db/vectors'
import { countBlocks, getBlockById, listBlockIdsWithMarkdownImages } from './db/blocks'
import { getSetting as getDbSetting, setSetting as setDbSetting, parseAIConfig } from './db/settings'
import { createLiveEmbeddingProvider, probeAiConfig, createConfigFingerprint } from './services/ai'
import {
  cleanupOrphanAttachments as cleanupOrphanAttachmentsService,
  rebuildAttachmentIndex as rebuildAttachmentIndexService,
} from './services/attachments'
import {
  isAIConfigured,
  createLiveVectorIndexState,
} from './appContext-utils'
import { getExternalAccessStatus as buildExternalAccessStatus, setupExternalAccessFiles, type ExternalAccessOptions } from './externalAccess'
import type { AppContextOptions, VectorIndexState } from './appContext-types'
import type { SettingsFileStore } from './settingsFile'

/** 需要持久化到文件的设置键集合 */
const FILE_BACKED_SETTING_KEYS = new Set([
  'ai_config',
  'ai_last_test_result',
  'token_usage_totals',
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  'doc_generation_settings',
  EXTERNAL_ACCESS_SETTINGS_KEY,
  UI_SETTINGS_KEY,
])

const AI_LAST_TEST_RESULT_KEY = 'ai_last_test_result'
const BACKGROUND_PROCESSING_PAUSED_KEY = 'background_processing_paused'

export interface SettingsDeps {
  db: import('better-sqlite3').Database
  options: AppContextOptions
  settingsStore: SettingsFileStore
  vectorReady: boolean
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  tokenSink: import('./services/ai-types').TokenUsageSink
  databasePath: string
  getExecutionMode: () => AIExecutionMode
  getUiSettings: () => { language: AppLanguage }
  getSavedConfig: () => AIConfig
  getSavedConfigFingerprint: () => string | null
  hasEquivalentAiTransport: (left: AIConfig, right: AIConfig) => boolean
  getLastAiTestResult: () => ApiTestResult | null
  getExternalAccessSettings: () => { enabled: boolean; generatedAt: string | null; skillTarget: 'claude-code' }
  getExternalAccessOptions: () => ExternalAccessOptions
  clearRuntimeAiError: () => boolean
  rememberRuntimeAiError: (error: unknown) => void
  t: (zh: string, en: string) => string
  clearDailyReviewCache: () => void
  isBackgroundProcessingPaused: () => boolean
  countBlocksByStatus: (status: Block['status']) => number
  countOversizedSkippedBlocks: () => number
  getBlockProcessingDecision: (content: string) => { shouldProcess: boolean; errorCode: string | null; errorMessage: string | null }
  clearQueuedEnrichTimer: () => void
  startQueuedEnrichFlush: () => void
  getQueuedEnrichRequests: () => import('./appContext-types').QueuedEnrichRequest[]
  setQueuedEnrichRequests: (value: import('./appContext-types').QueuedEnrichRequest[]) => void
  /** 标记搜索缓存为脏 */
  markSearchCachesDirty: () => void
  resumeBackgroundProcessingBacklog: () => void
  scheduleBlocksForImageAnalysisRefresh: (blockIds: string[]) => void
  clearBlocksImageAnalysisDerivedState: (blockIds: string[]) => Block[]
  emitBlockChangedWithDerivedInvalidation: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<Block, 'id' | 'updatedAt'>>) => void
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  emitCalendarChanged: (event: import('../shared/types').CalendarChangedEvent) => void
  getCalendarSettings: () => { aiSuggestionsEnabled: boolean }
  /** 当前向量维度 */
  getCurrentVectorDimension: () => number | null
  /** 向量 schema 是否就绪 */
  getVectorSchemaReady: () => boolean
  /** 重建索引任务是否正在执行 */
  getReindexTask: () => Promise<void> | null
  /** 当前活跃的重建状态 */
  getActiveReindexState: () => { indexState: VectorIndexState; fullRebuild: boolean } | null
  /** 启动时恢复的块数量 */
  getStartupRecoveredBlockCount: () => number
  /** 当前向量索引状态 */
  getCurrentVectorIndexState: () => VectorIndexState | null
  /** 确保 schema 适配指定维度 */
  ensureSchemaForDimension: (dimension: number) => boolean
  /** 调度向量重建 */
  scheduleReindex: (embeddingProvider: import('./services/ai').EmbeddingProvider, mode: AIExecutionMode, indexState: VectorIndexState, options: { fullRebuild?: boolean }) => void
  /** 根据当前配置确保向量 schema */
  ensureVectorSchemaForCurrentState: (forceFullRebuild?: boolean) => void
  /** 向量索引状态持久化 */
  persistVectorIndexState: (state: VectorIndexState | null) => void
  /** 当前配置指纹对应的期望向量索引状态 */
  getDesiredVectorIndexState: () => VectorIndexState | null
  /** 判断向量索引是否兼容 */
  isVectorIndexCompatible: (targetState: VectorIndexState | null) => boolean
  /** 向量 provider 状态 */
  getVectorProviderState: () => { mode: AIExecutionMode; embeddingProvider: import('./services/ai').EmbeddingProvider; indexState: VectorIndexState } | null
  /** 获取 token 使用情况 */
  getTokenUsage: () => import('../shared/types').TokenUsage
  /** 获取累计 token 使用情况 */
  getLifetimeTokenUsage: () => import('../shared/types').TokenUsage
  /** 获取模型调用次数 */
  getModelCallCounts: () => ModelCallCounts
  /** 获取最后一次 AI 错误 */
  getLastAiError: () => string | null
  /** pending 任务集合 */
  pendingTasks: Set<Promise<unknown>>
  /** 富化队列刷新任务 */
  queuedEnrichFlushTask: Promise<void> | null
  /** 设置 queuedEnrichFlushTask */
  setQueuedEnrichFlushTask: (value: Promise<void> | null) => void
  /** 设置已销毁标志 */
  setDisposed: (value: boolean) => void
  /** 获取已销毁标志 */
  getDisposed: () => boolean
  /** 设置数据库关闭标志 */
  setDbClosed: (value: boolean) => void
  /** 获取数据库关闭标志 */
  getDbClosed: () => boolean
  /** trackTask */
  trackTask: <T>(task: Promise<T>) => Promise<T>
}

export interface SettingsModule {
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  testApi: (config: AIConfig) => Promise<ApiTestResult>
  getMeta: () => Promise<import('../shared/types').AppMeta>
  openDataDirectory: () => Promise<void>
  openSettingsDirectory: () => Promise<void>
  getDataManagementOverview: () => Promise<import('../shared/types').DataManagementOverview>
  cleanupOrphanAttachments: () => Promise<import('../shared/types').AttachmentCleanupResult>
  rebuildAttachmentIndex: () => Promise<import('../shared/types').AttachmentIndexRebuildResult>
  rebuildAllVectors: () => Promise<import('../shared/types').VectorRebuildResult>
  setBackgroundProcessingPaused: (paused: boolean) => Promise<{ paused: boolean }>
  clearPendingVectors: () => Promise<number>
  clearFailedVectors: () => Promise<number>
  retryFailedVectors: () => Promise<number>
  whenIdle: () => Promise<void>
  dispose: () => void
  getExternalAccessStatus: () => Promise<import('../shared/types').ExternalAccessStatus>
  enableExternalAccess: () => Promise<import('../shared/types').ExternalAccessStatus>
  generateExternalAccessBundle: () => Promise<import('../shared/types').ExternalAccessStatus>
  setupExternalAccess: () => Promise<import('../shared/types').ExternalAccessStatus>
  disableExternalAccess: () => Promise<import('../shared/types').ExternalAccessStatus>
  openExternalAccessDirectory: () => Promise<void>
}

export function createSettingsModule(deps: SettingsDeps): SettingsModule {
  const {
    db,
    options,
    settingsStore,
    vectorReady,
    emitMetaChanged,
    tokenSink,
    databasePath,
    getExecutionMode,
    getUiSettings,
    getSavedConfig,
    getSavedConfigFingerprint,
    hasEquivalentAiTransport,
    getLastAiTestResult,
    getExternalAccessSettings,
    getExternalAccessOptions,
    clearRuntimeAiError,
    t,
    clearDailyReviewCache,
    isBackgroundProcessingPaused,
    countBlocksByStatus,
    countOversizedSkippedBlocks,
    clearQueuedEnrichTimer,
    startQueuedEnrichFlush,
    getQueuedEnrichRequests,
    resumeBackgroundProcessingBacklog,
    scheduleBlocksForImageAnalysisRefresh,
    clearBlocksImageAnalysisDerivedState,
    emitBlockChangedWithDerivedInvalidation,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    emitCalendarChanged,
    getCalendarSettings,
    getCurrentVectorDimension,
    getVectorSchemaReady,
    getReindexTask,
    getActiveReindexState,
    getStartupRecoveredBlockCount,
    getCurrentVectorIndexState,
    ensureSchemaForDimension,
    scheduleReindex,
    ensureVectorSchemaForCurrentState,
    getVectorProviderState,
    getTokenUsage,
    getLifetimeTokenUsage,
    getModelCallCounts,
    getLastAiError,
    pendingTasks,
    queuedEnrichFlushTask,
    setDisposed,
    setDbClosed,
    getDbClosed,
    trackTask,
  } = deps

  return {
    async getSetting(key) {
      return FILE_BACKED_SETTING_KEYS.has(key) ? settingsStore.get(key) : getDbSetting(db, key)
    },

    async setSetting(key, value) {
      const previousValue = FILE_BACKED_SETTING_KEYS.has(key) ? settingsStore.get(key) : getDbSetting(db, key)
      const previousAiConfig = key === 'ai_config' ? parseAIConfig(previousValue) : null

      if (previousValue !== value) {
        clearDailyReviewCache()
      }

      if (FILE_BACKED_SETTING_KEYS.has(key)) {
        settingsStore.set(key, value)
      } else {
        setDbSetting(db, key, value)
      }

      if (key === 'ai_config' && previousValue !== value) {
        const savedConfig = getSavedConfig()
        const savedFingerprint = isAIConfigured(savedConfig) ? createConfigFingerprint(savedConfig) : null
        const lastTestResult = getLastAiTestResult()
        const transportChanged = previousAiConfig ? !hasEquivalentAiTransport(previousAiConfig, savedConfig) : true
        const multimodalChanged = previousAiConfig
          ? previousAiConfig.multimodalImageAnalysisEnabled !== savedConfig.multimodalImageAnalysisEnabled
          : false

        if (
          savedFingerprint
          && lastTestResult?.success
          && multimodalChanged
          && !transportChanged
          && !savedConfig.multimodalImageAnalysisEnabled
        ) {
          settingsStore.set(AI_LAST_TEST_RESULT_KEY, JSON.stringify({
            ...lastTestResult,
            configFingerprint: savedFingerprint,
            llmMultimodalOk: false,
          }))
        } else if (!savedFingerprint || lastTestResult?.configFingerprint !== savedFingerprint) {
          settingsStore.set(AI_LAST_TEST_RESULT_KEY, '')
        }

        clearRuntimeAiError()

        if (!isAIConfigured(savedConfig)) {
          ensureVectorSchemaForCurrentState(true)
        } else if (
          transportChanged
          && savedFingerprint
          && lastTestResult?.success
          && lastTestResult.configFingerprint === savedFingerprint
        ) {
          ensureVectorSchemaForCurrentState(true)
        }

        if (multimodalChanged) {
          const imageBlockIds = listBlockIdsWithMarkdownImages(db)

          if (imageBlockIds.length > 0) {
            if (!savedConfig.multimodalImageAnalysisEnabled) {
              const updatedBlocks = clearBlocksImageAnalysisDerivedState(imageBlockIds)

              for (const block of updatedBlocks) {
                emitBlockChangedWithDerivedInvalidation({
                  block,
                  reason: 'enriched',
                })
              }

              enqueueBlocksForVectorReindex(updatedBlocks)
              scheduleCurrentVectorReindex()
            }

            const canRefreshImmediately =
              isAIConfigured(savedConfig)
              && (
                getExecutionMode() === 'live'
                || (
                  !savedConfig.multimodalImageAnalysisEnabled
                  && !transportChanged
                  && Boolean(lastTestResult?.success)
                )
              )

            if (canRefreshImmediately) {
              scheduleBlocksForImageAnalysisRefresh(imageBlockIds)
            }
          }
        }
      }

      if ((key === 'ai_config' || key === BLOCK_ENRICH_SETTINGS_KEY) && getQueuedEnrichRequests().length > 0) {
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
      const result = await probeAiConfig(config, getUiSettings().language)
      settingsStore.set(AI_LAST_TEST_RESULT_KEY, JSON.stringify(result))
      const savedFingerprint = getSavedConfigFingerprint()
      const testedFingerprint = result.configFingerprint ?? createConfigFingerprint(config)
      const appliesToSavedConfig = Boolean(savedFingerprint) && testedFingerprint === savedFingerprint

      if (vectorReady && result.success && result.embeddingDimension && appliesToSavedConfig) {
        const schemaChanged = ensureSchemaForDimension(result.embeddingDimension)
        const targetState = createLiveVectorIndexState(testedFingerprint)
        const embeddingProvider = createLiveEmbeddingProvider(config, tokenSink)
        scheduleReindex(embeddingProvider, 'live', targetState, {
          fullRebuild: schemaChanged || !(getCurrentVectorIndexState() && targetState && (getCurrentVectorIndexState()!.mode === targetState.mode && getCurrentVectorIndexState()!.configFingerprint === targetState.configFingerprint)),
        })
      }

      if (result.success && config.multimodalImageAnalysisEnabled && appliesToSavedConfig) {
        scheduleBlocksForImageAnalysisRefresh(listBlockIdsWithMarkdownImages(db))
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
        resolvedBaseUrl: isAIConfigured(config) ? (await import('./services/ai')).resolveBaseUrl(config.llm.endpoint || config.embedding.endpoint) : null,
        vectorDimension: getCurrentVectorDimension(),
        vectorSchemaReady: vectorReady && getVectorSchemaReady(),
        activeAiMode,
        lastAiError: getLastAiError(),
        lastAiTestResult,
        modelCallCounts: getModelCallCounts(),
        tokenUsage: tokenUsage.requestCount > 0 ? tokenUsage : null,
        lifetimeTokenUsage: lifetimeTokenUsage.requestCount > 0 ? lifetimeTokenUsage : null,
        failedVectorCount: countFailedBlockVectors(db),
        pendingVectorCount,
        vectorQueueProcessing: Boolean(getReindexTask() || getActiveReindexState()) && pendingVectorCount > 0,
        pendingBlockCount: countBlocksByStatus('pending'),
        skippedBlockCount: countBlocksByStatus('skipped'),
        oversizedSkippedBlockCount: countOversizedSkippedBlocks(),
        backgroundProcessingPaused: isBackgroundProcessingPaused(),
        recoveryModeActive: getStartupRecoveredBlockCount() > 0,
        startupRecoveredBlockCount: getStartupRecoveredBlockCount(),
      }
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
        totalVectorCount: vectorReady && getCurrentVectorDimension() !== null ? countBlockVectors(db) : 0,
        vectorReady,
        aiConfigured: isAIConfigured(config),
        activeAiMode: getExecutionMode(),
        vectorDimension: getCurrentVectorDimension(),
        vectorSchemaReady: vectorReady && getVectorSchemaReady(),
        failedVectorCount: countFailedBlockVectors(db),
        pendingVectorCount,
        vectorQueueProcessing: Boolean(getReindexTask() || getActiveReindexState()) && pendingVectorCount > 0,
        tokenUsage: tokenUsage.requestCount > 0 ? tokenUsage : null,
        pendingBlockCount: countBlocksByStatus('pending'),
        skippedBlockCount: countBlocksByStatus('skipped'),
        oversizedSkippedBlockCount: countOversizedSkippedBlocks(),
        backgroundProcessingPaused: isBackgroundProcessingPaused(),
        recoveryModeActive: getStartupRecoveredBlockCount() > 0,
        startupRecoveredBlockCount: getStartupRecoveredBlockCount(),
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
      if (!vectorReady || getCurrentVectorDimension() === null) {
        throw new Error(t('当前向量索引不可用，无法重建。', 'Vector index is unavailable and cannot be rebuilt.'))
      }

      const providerState = getVectorProviderState()

      if (!providerState) {
        throw new Error(t(
          '当前 AI / 向量配置尚未就绪，请先完成 API 测试或改用 mock。',
          'AI/vector configuration is not ready. Run API test first or switch to mock mode.',
        ))
      }

      const queuedBlockCount = countBlocks(db)

      clearFailedBlockVectors(db)
      const { resetPendingBlockVectors } = await import('./db/vectors')
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

    async setBackgroundProcessingPaused(paused) {
      const normalized = paused ? '1' : ''

      if (getDbSetting(db, BACKGROUND_PROCESSING_PAUSED_KEY) !== normalized) {
        setDbSetting(db, BACKGROUND_PROCESSING_PAUSED_KEY, normalized)
      }

      if (paused) {
        clearQueuedEnrichTimer()
      } else {
        resumeBackgroundProcessingBacklog()
      }

      emitMetaChanged({
        reason: 'settings',
      })
      emitMetaChanged({
        reason: 'data-management',
      })

      return {
        paused: isBackgroundProcessingPaused(),
      }
    },

    async clearPendingVectors() {
      const pendingCount = countPendingBlockVectors(db)
      db.exec(`DELETE FROM pending_block_vectors`)

      emitMetaChanged({
        reason: 'vector-queue',
      })
      emitMetaChanged({
        reason: 'data-management',
      })

      return pendingCount
    },

    async clearFailedVectors() {
      const failedCount = countFailedBlockVectors(db)
      clearFailedBlockVectors(db)

      emitMetaChanged({
        reason: 'vector-failure',
      })
      emitMetaChanged({
        reason: 'data-management',
      })

      return failedCount
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

    async getExternalAccessStatus() {
      return buildExternalAccessStatus(getExternalAccessSettings(), getExternalAccessOptions(), getUiSettings().language)
    },

    async enableExternalAccess() {
      const nextSettings = {
        ...getExternalAccessSettings(),
        enabled: true,
        skillTarget: 'claude-code' as const,
      }

      settingsStore.set(EXTERNAL_ACCESS_SETTINGS_KEY, JSON.stringify(nextSettings))

      emitMetaChanged({
        reason: 'settings',
      })

      return buildExternalAccessStatus(nextSettings, getExternalAccessOptions(), getUiSettings().language)
    },

    async generateExternalAccessBundle() {
      const nextSettings = {
        ...getExternalAccessSettings(),
        generatedAt: new Date().toISOString(),
        skillTarget: 'claude-code' as const,
      }

      await setupExternalAccessFiles(getExternalAccessOptions(), getUiSettings().language)
      settingsStore.set(EXTERNAL_ACCESS_SETTINGS_KEY, JSON.stringify(nextSettings))

      emitMetaChanged({
        reason: 'settings',
      })

      return buildExternalAccessStatus(nextSettings, getExternalAccessOptions(), getUiSettings().language)
    },

    async setupExternalAccess() {
      const enabledSettings = {
        ...getExternalAccessSettings(),
        enabled: true,
        generatedAt: new Date().toISOString(),
        skillTarget: 'claude-code' as const,
      }

      await setupExternalAccessFiles(getExternalAccessOptions(), getUiSettings().language)
      settingsStore.set(EXTERNAL_ACCESS_SETTINGS_KEY, JSON.stringify(enabledSettings))

      emitMetaChanged({
        reason: 'settings',
      })

      return buildExternalAccessStatus(enabledSettings, getExternalAccessOptions(), getUiSettings().language)
    },

    async disableExternalAccess() {
      const nextSettings = {
        ...getExternalAccessSettings(),
        enabled: false,
      }

      settingsStore.set(EXTERNAL_ACCESS_SETTINGS_KEY, JSON.stringify(nextSettings))

      emitMetaChanged({
        reason: 'settings',
      })

      return buildExternalAccessStatus(nextSettings, getExternalAccessOptions(), getUiSettings().language)
    },

    async openExternalAccessDirectory() {
      if (!options.openPath) {
        return
      }

      const status = await buildExternalAccessStatus(getExternalAccessSettings(), getExternalAccessOptions(), getUiSettings().language)
      const openResult = await options.openPath(status.cliDirectory)

      if (openResult) {
        throw new Error(openResult)
      }
    },

    async whenIdle() {
      if (!isBackgroundProcessingPaused() && (getQueuedEnrichRequests().length > 0 || queuedEnrichFlushTask)) {
        startQueuedEnrichFlush()
      }

      while (pendingTasks.size > 0 || getQueuedEnrichRequests().length > 0 || queuedEnrichFlushTask) {
        if (!isBackgroundProcessingPaused() && !queuedEnrichFlushTask && getQueuedEnrichRequests().length > 0) {
          startQueuedEnrichFlush()
        }

        await Promise.allSettled(Array.from(pendingTasks))
      }
    },

    dispose() {
      setDisposed(true)
      clearQueuedEnrichTimer()

      const closeDb = () => {
        if (getDbClosed()) {
          return
        }

        setDbClosed(true)
        db.close()
      }

      if (pendingTasks.size > 0) {
        void Promise.allSettled(Array.from(pendingTasks)).finally(closeDb)
        return
      }

      closeDb()
    },
  }
}
