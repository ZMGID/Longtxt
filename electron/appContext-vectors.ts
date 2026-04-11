/**
 * appContext-vectors.ts
 *
 * 向量索引与 AI 状态管理模块。
 * 从 appContext.ts 中提取，负责向量索引状态判断、provider 构造、
 * 向量重索引调度与执行等逻辑。
 */

import { MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH } from '../shared/config'
import type { AIExecutionMode, Block } from '../shared/types'
import {
  DEFAULT_MOCK_EMBEDDING_DIMENSION,
  createConfigFingerprint,
  createLiveEmbeddingProvider,
  createLiveLLMProvider,
  createMockEmbeddingProvider,
  createMockLLMProvider,
  type EmbeddingProvider,
  type LLMProvider,
} from './services/ai'
import type { TokenUsageSink } from './services/ai-types'
import type { VectorIndexState } from './appContext-types'
import {
  countBlockVectors,
  countPendingBlockVectors,
  ensureVectorSchema,
  listPendingBlockVectors,
  getPendingBlockVectorsByIds,
  insertFailedBlockVector,
  removeFailedBlockVector,
  removePendingBlockVectors,
  resetPendingBlockVectors,
  upsertBlockVector,
  enqueueBlockVector,
} from './db/vectors'
import { countBlocks, getBlockById, getBlockSearchTextsByIds, getBlocksByIds, updateBlockState } from './db/blocks'
import {
  isAIConfigured,
  isSameVectorIndexState,
  createMockVectorIndexState,
  createLiveVectorIndexState,
  getBackgroundProcessingDecision,
} from './appContext-utils'
import { setSetting as setDbSetting } from './db/settings'

// ─── 常量 ──────────────────────────────────────────────────────────────────

const VECTOR_INDEX_STATE_KEY = 'vector_index_state'
const VECTOR_REINDEX_BATCH_SIZE = 12

// ─── 依赖接口 ──────────────────────────────────────────────────────────────

export interface VectorDeps {
  db: import('better-sqlite3').Database
  vectorReady: boolean
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  emitBlockChangedWithDerivedInvalidation: (event: {
    block: import('../shared/types').Block
    reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged'
  }) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  markSearchCachesDirty: () => void
  getSavedConfig: () => import('../shared/types').AIConfig
  getLastAiTestResult: () => import('../shared/types').ApiTestResult | null
  getUiSettings: () => { language: import('../shared/types').AppLanguage }
  isBackgroundProcessingPaused: () => boolean
  clearRuntimeAiError: () => boolean
  rememberRuntimeAiError: (error: unknown) => void
  tokenSink: TokenUsageSink
  // 可变状态的 getter / setter 对
  getVectorSchemaReady: () => boolean
  setVectorSchemaReady: (value: boolean) => void
  getCurrentVectorDimension: () => number | null
  setCurrentVectorDimension: (value: number | null) => void
  getCurrentVectorIndexState: () => VectorIndexState | null
  setCurrentVectorIndexState: (value: VectorIndexState | null) => void
  getReindexTask: () => Promise<void> | null
  setReindexTask: (value: Promise<void> | null) => void
  getActiveReindexState: () => { indexState: VectorIndexState; fullRebuild: boolean } | null
  setActiveReindexState: (value: { indexState: VectorIndexState; fullRebuild: boolean } | null) => void
}

// ─── 模块接口 ──────────────────────────────────────────────────────────────

export interface VectorModule {
  getSavedConfigFingerprint: () => string | null
  persistVectorIndexState: (state: VectorIndexState | null) => void
  getPreferredVectorDimension: () => number
  getExecutionMode: () => AIExecutionMode
  getDesiredVectorIndexState: () => VectorIndexState | null
  isVectorIndexCompatible: (targetState: VectorIndexState | null) => boolean
  canUseVectorSearch: () => boolean
  getProviders: () => { mode: AIExecutionMode; embeddingProvider: EmbeddingProvider; llmProvider: LLMProvider }
  getVectorProviderState: () => { mode: AIExecutionMode; embeddingProvider: EmbeddingProvider; indexState: VectorIndexState } | null
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<Block, 'id' | 'updatedAt'>>) => void
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  getQueryEmbedding: (query: string, mode: AIExecutionMode, embeddingProvider: EmbeddingProvider) => Promise<number[] | null>
  reindexVectors: (
    embeddingProvider: EmbeddingProvider,
    mode: AIExecutionMode,
    indexState: VectorIndexState,
    options: { fullRebuild: boolean },
  ) => Promise<void>
  scheduleReindex: (
    embeddingProvider: EmbeddingProvider,
    mode: AIExecutionMode,
    indexState: VectorIndexState,
    options?: { fullRebuild?: boolean },
  ) => void
  ensureSchemaForDimension: (dimension: number) => boolean
  ensureVectorSchemaForCurrentState: (forceFullRebuild?: boolean) => void
}

// ─── 工厂函数 ──────────────────────────────────────────────────────────────

export function createVectorModule(deps: VectorDeps): VectorModule {
  const {
    db,
    vectorReady,
    emitMetaChanged,
    emitBlockChangedWithDerivedInvalidation,
    trackTask,
    markSearchCachesDirty,
    getSavedConfig,
    getLastAiTestResult,
    getUiSettings,
    isBackgroundProcessingPaused,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    tokenSink,
    getVectorSchemaReady,
    setVectorSchemaReady,
    getCurrentVectorDimension,
    setCurrentVectorDimension,
    getCurrentVectorIndexState,
    setCurrentVectorIndexState,
    getReindexTask,
    setReindexTask,
    getActiveReindexState,
    setActiveReindexState,
  } = deps

  // 重索引调度内部可变状态（仅在本模块内部流转，不需要外部 getter/setter）
  let reindexRequested = false
  let reindexNeedsFullRebuild = false
  let reindexProviderState: {
    embeddingProvider: EmbeddingProvider
    mode: AIExecutionMode
    indexState: VectorIndexState
  } | null = null

  // ─── AI 状态判断 ────────────────────────────────────────────────────────

  function getSavedConfigFingerprint(): string | null {
    const config = getSavedConfig()
    return isAIConfigured(config) ? createConfigFingerprint(config) : null
  }

  function persistVectorIndexState(state: VectorIndexState | null): void {
    setCurrentVectorIndexState(state)
    setDbSetting(db, VECTOR_INDEX_STATE_KEY, state ? JSON.stringify(state) : '')
  }

  function getPreferredVectorDimension(): number {
    return getLastAiTestResult()?.embeddingDimension ?? getCurrentVectorDimension() ?? DEFAULT_MOCK_EMBEDDING_DIMENSION
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
    return vectorReady && getVectorSchemaReady() && isSameVectorIndexState(getCurrentVectorIndexState(), targetState)
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

  // ─── 向量管理 ──────────────────────────────────────────────────────────

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
    if (isBackgroundProcessingPaused()) {
      return
    }

    const providerState = getVectorProviderState()

    if (!providerState || !vectorReady || getCurrentVectorDimension() === null) {
      return
    }

    const currentVectorIndexState = getCurrentVectorIndexState()
    const activeReindexState = getActiveReindexState()

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

  async function reindexVectors(
    embeddingProvider: EmbeddingProvider,
    mode: AIExecutionMode,
    indexState: VectorIndexState,
    options: { fullRebuild: boolean },
  ): Promise<void> {
    if (!vectorReady || !getCurrentVectorDimension()) {
      setVectorSchemaReady(false)
      return
    }

    if (options.fullRebuild) {
      persistVectorIndexState(null)
      resetPendingBlockVectors(db)
    }

    try {
      while (true) {
        if (isBackgroundProcessingPaused()) {
          break
        }

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

        const searchTextMap = getBlockSearchTextsByIds(db, batch.map((block) => block.id))
        const oversizedBlocks = batch.filter((block) => {
          const searchText = searchTextMap.get(block.id) ?? block.content
          return searchText.length > MAX_BLOCK_BACKGROUND_PROCESSING_LENGTH
        })

        if (oversizedBlocks.length > 0) {
          const updatedAt = new Date().toISOString()

          for (const block of oversizedBlocks) {
            const skippedBlock = updateBlockState(db, {
              id: block.id,
              status: 'skipped',
              aiMode: block.aiMode,
              updatedAt,
              errorCode: 'too_large',
              errorMessage: getBackgroundProcessingDecision(block.content, getUiSettings().language).errorMessage,
            })

            emitBlockChangedWithDerivedInvalidation({
              block: skippedBlock,
              reason: 'enriched',
            })
          }

          removePendingBlockVectors(db, oversizedBlocks.map((block) => block.id))
          emitMetaChanged({
            reason: 'vector-queue',
          })
        }

        const processableBatch = batch.filter((block) => !oversizedBlocks.some((candidate) => candidate.id === block.id))

        if (processableBatch.length === 0) {
          continue
        }

        const embeddings = await embeddingProvider.embed(processableBatch.map((block) => searchTextMap.get(block.id) ?? block.content))
        const latestJobs = new Map(getPendingBlockVectorsByIds(db, processableBatch.map((block) => block.id)).map((job) => [job.blockId, job]))
        const completedIds: string[] = []

        for (const [index, block] of processableBatch.entries()) {
          const vector = embeddings[index]

          if (!vector) {
            continue
          }

          if (getCurrentVectorDimension() !== vector.length) {
            const schema = ensureVectorSchema(db, vector.length)
            setCurrentVectorDimension(schema.currentDimension)

            if (schema.changed) {
              persistVectorIndexState(null)
              setVectorSchemaReady(false)
              resetPendingBlockVectors(db)
            }
          }

          const latestJob = latestJobs.get(block.id)

          if (!latestJob || latestJob.contentUpdatedAt !== block.updatedAt) {
            continue
          }

          if (getCurrentVectorDimension() === vector.length) {
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

      if (getCurrentVectorDimension() !== null && countPendingBlockVectors(db) === 0) {
        setVectorSchemaReady(true)
        persistVectorIndexState(indexState)
      }

      markSearchCachesDirty()
      emitMetaChanged({
        reason: 'vector-queue',
      })
    } catch (error) {
      // 将当前 pending batch 中尚未完成的块记录到失败表
      const remainingJobs = listPendingBlockVectors(db, VECTOR_REINDEX_BATCH_SIZE)
      for (const job of remainingJobs) {
        try {
          const block = getBlockById(db, job.blockId)
          const searchText = getBlockSearchTextsByIds(db, [block.id]).get(block.id) ?? block.content
          insertFailedBlockVector(db, block.id, searchText, error instanceof Error ? error.message : String(error))
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
    if (!vectorReady || getCurrentVectorDimension() === null) {
      return
    }

    reindexRequested = true
    reindexProviderState = { embeddingProvider, mode, indexState }

    if (options.fullRebuild) {
      reindexNeedsFullRebuild = true
    }

    if (getReindexTask()) {
      return
    }

    const task = trackTask(
      (async () => {
        while (!isBackgroundProcessingPaused() && (reindexRequested || reindexNeedsFullRebuild || countPendingBlockVectors(db) > 0)) {
          const providerState = reindexProviderState ?? { embeddingProvider, mode, indexState }
          const fullRebuild = reindexNeedsFullRebuild

          reindexRequested = false
          reindexProviderState = null
          reindexNeedsFullRebuild = false
          setActiveReindexState({
            indexState: providerState.indexState,
            fullRebuild,
          })

          await reindexVectors(providerState.embeddingProvider, providerState.mode, providerState.indexState, { fullRebuild })
          setActiveReindexState(null)
        }
      })().finally(() => {
        setReindexTask(null)
        setActiveReindexState(null)

        if (!isBackgroundProcessingPaused() && (reindexRequested || reindexNeedsFullRebuild || countPendingBlockVectors(db) > 0)) {
          const providerState = reindexProviderState ?? { embeddingProvider, mode, indexState }
          scheduleReindex(providerState.embeddingProvider, providerState.mode, providerState.indexState)
        }
      }),
    )

    setReindexTask(task)
  }

  function ensureSchemaForDimension(dimension: number): boolean {
    if (!vectorReady) {
      return false
    }

    const schema = ensureVectorSchema(db, dimension)
    setCurrentVectorDimension(schema.currentDimension)

    if (schema.changed) {
      persistVectorIndexState(null)
      setVectorSchemaReady(false)
      return true
    }

    if (getCurrentVectorDimension() !== null && getReindexTask() === null && countPendingBlockVectors(db) === 0) {
      setVectorSchemaReady(true)
    }

    return false
  }

  function ensureVectorSchemaForCurrentState(forceFullRebuild = false): void {
    if (!vectorReady) {
      return
    }

    if (isBackgroundProcessingPaused()) {
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
      !isSameVectorIndexState(getCurrentVectorIndexState(), desiredState) ||
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

  return {
    getSavedConfigFingerprint,
    persistVectorIndexState,
    getPreferredVectorDimension,
    getExecutionMode,
    getDesiredVectorIndexState,
    isVectorIndexCompatible,
    canUseVectorSearch,
    getProviders,
    getVectorProviderState,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    getQueryEmbedding,
    reindexVectors,
    scheduleReindex,
    ensureSchemaForDimension,
    ensureVectorSchemaForCurrentState,
  }
}
