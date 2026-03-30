import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import { DEFAULT_PAGE_SIZE } from '../shared/config'
import type {
  AIConfig,
  AIExecutionMode,
  ApiTestResult,
  AppMeta,
  Block,
  BlockChangedEvent,
  DocGenerationChunk,
  DocGenerationStart,
  ExportOptions,
  GraphEdge,
  GraphNode,
  ImportConflictStrategy,
  ImportPreview,
  PaginationInput,
  SearchResult,
  Snapshot,
  TagSuggestion,
} from '../shared/types'
import {
  addManualTagToBlock,
  clearAutoBlockTags,
  countBlocks,
  createBlockRecord,
  deleteBlockRecord,
  getBlockById,
  getBlocksByIds,
  listBlockContents,
  listBlocks,
  removeTagFromBlock,
  syncAutoBlockTags,
  updateBlockContent,
  updateBlockState,
} from './db/blocks'
import { initializeDatabase } from './db'
import { getGraphData as loadGraphData } from './db/graph'
import { searchBlocks as searchBlocksInDatabase, searchBlocksByTag } from './db/search'
import { getAIConfig, getSetting, setSetting } from './db/settings'
import { createSnapshot, getSnapshot, listSnapshots, removeSnapshot } from './db/snapshots'
import { getOrCreateTag, getTagMemory, listAvailableTags } from './db/tags'
import { deleteBlockVector, ensureVectorSchema, getVectorSchemaDimension, upsertBlockVector } from './db/vectors'
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
import { streamDocumentGeneration } from './services/docgen'
import { createTaggerEngine } from './services/tagger'
import { cleanupOrphanAttachments, rebuildAttachmentIndex, saveImageDataUrl, syncBlockAttachmentRecords } from './services/attachments'
import { confirmImportJob, exportJsonBundle, exportMarkdownBundle, previewJsonImport, previewMarkdownImport } from './services/importExport'

const AI_LAST_TEST_RESULT_KEY = 'ai_last_test_result'

export interface AppContextOptions {
  dataDirectory: string
  onBlockChanged?: (event: BlockChangedEvent) => void
  onDocGenerationChunk?: (chunk: DocGenerationChunk) => void
  openPath?: (path: string) => Promise<string>
  chooseOpenPaths?: (options: {
    title: string
    filters: Array<{ name: string; extensions: string[] }>
    properties: Array<'openFile' | 'multiSelections' | 'openDirectory'>
  }) => Promise<string[]>
  chooseSavePath?: (options: {
    title: string
    defaultPath: string
    filters: Array<{ name: string; extensions: string[] }>
  }) => Promise<string | null>
  chooseDirectory?: (title: string) => Promise<string | null>
}

export interface AppContext {
  createBlock(content: string): Promise<Block>
  getBlock(id: string): Promise<Block>
  listBlocks(params?: PaginationInput): Promise<Block[]>
  updateBlock(id: string, content: string): Promise<Block>
  removeBlock(id: string): Promise<void>
  addTag(blockId: string, tagName: string): Promise<Block>
  removeTag(blockId: string, tagId: string): Promise<Block>
  listTags(query?: string): Promise<TagSuggestion[]>
  saveImage(dataUrl: string, filenameHint?: string): Promise<{ fileUrl: string; markdownAlt: string }>
  getGraphData(tagNames?: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  searchBlocks(query: string, limit?: number): Promise<SearchResult[]>
  searchByTag(tagName: string, limit?: number): Promise<SearchResult[]>
  generateDocument(topic: string): Promise<DocGenerationStart>
  saveSnapshot(topic: string, content: string, blockIds: string[]): Promise<Snapshot>
  listSnapshots(query?: string): Promise<Snapshot[]>
  getSnapshot(id: string): Promise<Snapshot>
  removeSnapshot(id: string): Promise<void>
  exportMarkdown(options: ExportOptions): Promise<{ path: string; count: number } | null>
  exportJson(options: ExportOptions): Promise<{ path: string; count: number } | null>
  previewImportMarkdown(filePaths?: string[]): Promise<ImportPreview | null>
  previewImportJson(filePath?: string): Promise<ImportPreview | null>
  confirmImport(importId: string, conflictStrategy: ImportConflictStrategy): Promise<{ imported: number }>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  testApi(config: AIConfig): Promise<ApiTestResult>
  getMeta(): Promise<AppMeta>
  openDataDirectory(): Promise<void>
  whenIdle(): Promise<void>
  dispose(): void
}

function validateContent(content: string): string {
  const trimmed = content.trim()

  if (!trimmed) {
    throw new Error('内容不能为空。')
  }

  return trimmed
}

function isAIConfigured(config: AIConfig): boolean {
  return Boolean(
    config.llm.endpoint.trim() &&
      config.llm.apiKey.trim() &&
      config.llm.model.trim() &&
      config.embedding.endpoint.trim() &&
      config.embedding.apiKey.trim() &&
      config.embedding.model.trim(),
  )
}

function parseApiTestResult(raw: string | null): ApiTestResult | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ApiTestResult>

    if (typeof parsed.success !== 'boolean') {
      return null
    }

    return {
      success: parsed.success,
      modelsOk: Boolean(parsed.modelsOk),
      embeddingOk: Boolean(parsed.embeddingOk),
      llmOk: Boolean(parsed.llmOk),
      llmStreamingOk: Boolean(parsed.llmStreamingOk),
      resolvedBaseUrl: parsed.resolvedBaseUrl ?? '',
      embeddingModel: parsed.embeddingModel ?? '',
      embeddingDimension: typeof parsed.embeddingDimension === 'number' ? parsed.embeddingDimension : null,
      chatModel: parsed.chatModel ?? '',
      error: parsed.error,
      checkedAt: parsed.checkedAt ?? new Date(0).toISOString(),
      configFingerprint: parsed.configFingerprint,
    }
  } catch {
    return null
  }
}

export function createAppContext(options: AppContextOptions): AppContext {
  mkdirSync(options.dataDirectory, { recursive: true })

  const databasePath = join(options.dataDirectory, 'changbu.sqlite3')
  const db = new Database(databasePath)
  const { vectorReady } = initializeDatabase(db)
  const tagger = createTaggerEngine()
  const pendingTasks = new Set<Promise<unknown>>()
  let reindexTask: Promise<void> | null = null
  let lastAiError: string | null = null
  let currentVectorDimension = vectorReady ? getVectorSchemaDimension(db) : null
  let vectorSchemaReady = vectorReady ? currentVectorDimension !== null : false
  const importJobs = new Map<string, Awaited<ReturnType<typeof previewMarkdownImport>>['job']>()

  void trackTask(rebuildAttachmentIndex(db, options.dataDirectory))

  function emitBlockChanged(event: BlockChangedEvent): void {
    options.onBlockChanged?.(event)
  }

  function emitDocGenerationChunk(chunk: DocGenerationChunk): void {
    options.onDocGenerationChunk?.(chunk)
  }

  function trackTask<T>(task: Promise<T>): Promise<T> {
    pendingTasks.add(task)
    task.finally(() => {
      pendingTasks.delete(task)
    })
    return task
  }

  function getLastAiTestResult(): ApiTestResult | null {
    return parseApiTestResult(getSetting(db, AI_LAST_TEST_RESULT_KEY))
  }

  function getSavedConfig(): AIConfig {
    return getAIConfig(db)
  }

  function getSavedConfigFingerprint(): string | null {
    const config = getSavedConfig()
    return isAIConfigured(config) ? createConfigFingerprint(config) : null
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
        embeddingProvider: createLiveEmbeddingProvider(config),
        llmProvider: createLiveLLMProvider(config),
      }
    }

    return {
      mode,
      embeddingProvider: createMockEmbeddingProvider(getPreferredVectorDimension()),
      llmProvider: createMockLLMProvider(mode),
    }
  }

  function clearRuntimeAiError(): void {
    lastAiError = null
  }

  function rememberRuntimeAiError(error: unknown): void {
    lastAiError = error instanceof Error ? error.message : 'AI 运行失败。'
  }

  async function reindexVectors(embeddingProvider: EmbeddingProvider, mode: AIExecutionMode): Promise<void> {
    if (!vectorReady || !currentVectorDimension) {
      vectorSchemaReady = false
      return
    }

    const total = countBlocks(db)

    if (total === 0) {
      vectorSchemaReady = true
      return
    }

    vectorSchemaReady = false

    try {
      const blocks = listBlocks(db, {
        offset: 0,
        limit: total,
      })

      for (let index = 0; index < blocks.length; index += 12) {
        const batch = blocks.slice(index, index + 12)
        const embeddings = await embeddingProvider.embed(batch.map((block) => block.content))

        for (const [batchIndex, block] of batch.entries()) {
          const vector = embeddings[batchIndex]

          if (!vector) {
            continue
          }

          if (currentVectorDimension !== vector.length) {
            const schema = ensureVectorSchema(db, vector.length)
            currentVectorDimension = schema.currentDimension
            vectorSchemaReady = false
          }

          upsertBlockVector(db, block.id, vector)
        }
      }

      vectorSchemaReady = true

      if (mode === 'live') {
        clearRuntimeAiError()
      }
    } catch (error) {
      vectorSchemaReady = false

      if (mode === 'live') {
        rememberRuntimeAiError(error)
      }

      throw error
    }
  }

  function scheduleReindex(embeddingProvider: EmbeddingProvider, mode: AIExecutionMode): void {
    if (reindexTask) {
      return
    }

    const task = trackTask(
      reindexVectors(embeddingProvider, mode).finally(() => {
        reindexTask = null
      }),
    )

    reindexTask = task
  }

  function ensureSchemaForDimension(dimension: number): void {
    if (!vectorReady) {
      return
    }

    const schema = ensureVectorSchema(db, dimension)
    currentVectorDimension = schema.currentDimension

    if (!schema.changed && currentVectorDimension !== null && reindexTask === null) {
      vectorSchemaReady = true
      return
    }

    if (schema.changed) {
      vectorSchemaReady = false
    }
  }

  function ensureVectorSchemaForCurrentState(): void {
    if (!vectorReady) {
      return
    }

    const preferredDimension = getPreferredVectorDimension()
    ensureSchemaForDimension(preferredDimension)

    const { mode, embeddingProvider } = getProviders()
    scheduleReindex(embeddingProvider, mode)
  }

  async function enrichBlock(blockId: string, content: string): Promise<void> {
    const { mode, embeddingProvider, llmProvider } = getProviders()

    try {
      const tagMemory = getTagMemory(db)
      const assignment = await tagger.assign(content, {
        corpusContents: listBlockContents(db),
        liveLlmProvider: mode === 'live' ? llmProvider : null,
        tagMemory,
      })
      const tags = [
        ...assignment.categories.map((tagName) => getOrCreateTag(db, tagName, 'category')),
        ...assignment.detailTags.map((tagName) => getOrCreateTag(db, tagName, 'detail')),
      ]
      syncAutoBlockTags(db, blockId, tags)

      const [embedding] = await embeddingProvider.embed([content])

      if (vectorReady && embedding) {
        if (currentVectorDimension !== embedding.length) {
          ensureSchemaForDimension(embedding.length)
          scheduleReindex(embeddingProvider, mode)
        }

        if (currentVectorDimension === embedding.length) {
          upsertBlockVector(db, blockId, embedding)
        }
      }

      if (mode === 'live') {
        clearRuntimeAiError()
      }

      const block = updateBlockState(db, {
        id: blockId,
        status: 'ready',
        aiMode: mode,
        summary: assignment.summary,
        updatedAt: new Date().toISOString(),
      })

      emitBlockChanged({
        block,
        reason: 'enriched',
      })
    } catch (error) {
      if (mode === 'live') {
        rememberRuntimeAiError(error)
      }

      const block = updateBlockState(db, {
        id: blockId,
        status: 'error',
        aiMode: mode,
        updatedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : '后台处理失败。',
      })

      emitBlockChanged({
        block,
        reason: 'enriched',
      })
    }
  }

  ensureVectorSchemaForCurrentState()

  return {
    async createBlock(content) {
      const safeContent = validateContent(content)
      const now = new Date().toISOString()
      const aiMode = getExecutionMode()
      const block = createBlockRecord(db, {
        id: uuid(),
        content: safeContent,
        status: 'pending',
        aiMode,
        createdAt: now,
        updatedAt: now,
      })

      syncBlockAttachmentRecords(db, options.dataDirectory, block.id, safeContent)

      emitBlockChanged({
        block,
        reason: 'created',
      })

      void trackTask(enrichBlock(block.id, safeContent))

      return block
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

    async updateBlock(id, content) {
      const safeContent = validateContent(content)
      const aiMode = getExecutionMode()
      const block = updateBlockContent(db, {
        id,
        content: safeContent,
        status: 'pending',
        aiMode,
        updatedAt: new Date().toISOString(),
      })

      syncBlockAttachmentRecords(db, options.dataDirectory, id, safeContent)

      clearAutoBlockTags(db, id)

      if (vectorReady) {
        deleteBlockVector(db, id)
      }

      emitBlockChanged({
        block,
        reason: 'updated',
      })

      void trackTask(enrichBlock(id, safeContent))
      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))

      return getBlockById(db, id)
    },

    async removeBlock(id) {
      const deletedBlock = deleteBlockRecord(db, id)

      if (vectorReady) {
        deleteBlockVector(db, id)
      }

      emitBlockChanged({
        block: deletedBlock,
        reason: 'deleted',
      })

      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))
    },

    async addTag(blockId, tagName) {
      const tag = getOrCreateTag(db, tagName, 'user')
      const block = addManualTagToBlock(db, blockId, tag)

      emitBlockChanged({
        block,
        reason: 'tagged',
      })

      return block
    },

    async removeTag(blockId, tagId) {
      const block = removeTagFromBlock(db, blockId, tagId)

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
      let queryEmbedding: number[] | null = null

      if (vectorReady && vectorSchemaReady) {
        try {
          queryEmbedding = (await embeddingProvider.embed([normalizedQuery]))[0] ?? null
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            throw error
          }

          queryEmbedding = null
        }
      }

      return searchBlocksInDatabase(db, normalizedQuery, {
        limit,
        queryEmbedding,
        vectorEnabled: vectorReady && vectorSchemaReady && Boolean(queryEmbedding),
      })
    },

    async searchByTag(tagName, limit = 50) {
      return searchBlocksByTag(db, tagName, limit)
    },

    async generateDocument(topic) {
      const safeTopic = validateContent(topic)
      const requestId = uuid()
      const { mode, embeddingProvider, llmProvider } = getProviders()
      let queryEmbedding: number[] | null = null

      if (vectorReady && vectorSchemaReady) {
        try {
          queryEmbedding = (await embeddingProvider.embed([safeTopic]))[0] ?? null
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            throw error
          }
        }
      }

      const results = searchBlocksInDatabase(db, safeTopic, {
        limit: 30,
        queryEmbedding,
        vectorEnabled: vectorReady && vectorSchemaReady && Boolean(queryEmbedding),
      })
      const blocks = results.length > 0 ? results.map((result) => result.block) : listBlocks(db, { limit: 5 })

      void trackTask(
        (async () => {
          try {
            for await (const chunk of streamDocumentGeneration(requestId, safeTopic, blocks, llmProvider, mode)) {
              if (mode === 'live' && chunk.delta) {
                clearRuntimeAiError()
              }

              emitDocGenerationChunk(chunk)
            }
          } catch (error) {
            if (mode === 'live') {
              rememberRuntimeAiError(error)
            }

            emitDocGenerationChunk({
              requestId,
              topic: safeTopic,
              delta: '',
              done: true,
              mode,
              error: error instanceof Error ? error.message : '文档生成失败。',
            })
          }
        })(),
      )

      return {
        requestId,
        topic: safeTopic,
        mode,
        blockIds: blocks.map((block) => block.id),
      }
    },

    async saveSnapshot(topic, content, blockIds) {
      return createSnapshot(db, validateContent(topic), content, blockIds)
    },

    async listSnapshots(query = '') {
      return listSnapshots(db, query)
    },

    async getSnapshot(id) {
      return getSnapshot(db, id)
    },

    async removeSnapshot(id) {
      removeSnapshot(db, id)
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

      const result = await confirmImportJob(db, options.dataDirectory, job, conflictStrategy)
      importJobs.delete(importId)
      const importedBlocks = getBlocksByIds(db, result.importedIds)

      for (const block of importedBlocks) {
        emitBlockChanged({
          block,
          reason: 'created',
        })

        if (job.format === 'markdown') {
          void trackTask(enrichBlock(block.id, block.content))
        }
      }

      const { mode, embeddingProvider } = getProviders()
      scheduleReindex(embeddingProvider, mode)
      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))
      return result
    },

    async getSetting(key) {
      return getSetting(db, key)
    },

    async setSetting(key, value) {
      const previousValue = getSetting(db, key)
      setSetting(db, key, value)

      if (key === 'ai_config' && previousValue !== value) {
        const savedConfig = getSavedConfig()
        const savedFingerprint = isAIConfigured(savedConfig) ? createConfigFingerprint(savedConfig) : null
        const lastTestResult = getLastAiTestResult()

        if (!savedFingerprint || lastTestResult?.configFingerprint !== savedFingerprint) {
          setSetting(db, AI_LAST_TEST_RESULT_KEY, '')
        }

        clearRuntimeAiError()
        ensureVectorSchemaForCurrentState()
      }
    },

    async testApi(config) {
      const result = await probeAiConfig(config)
      setSetting(db, AI_LAST_TEST_RESULT_KEY, JSON.stringify(result))

      if (vectorReady && result.success && result.embeddingDimension) {
        ensureSchemaForDimension(result.embeddingDimension)
        const embeddingProvider = createLiveEmbeddingProvider(config)
        scheduleReindex(embeddingProvider, 'live')
      }

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

      return {
        dataDirectory: options.dataDirectory,
        vectorReady,
        aiConfigured: isAIConfigured(config),
        resolvedBaseUrl: isAIConfigured(config) ? resolveBaseUrl(config.llm.endpoint || config.embedding.endpoint) : null,
        vectorDimension: currentVectorDimension,
        vectorSchemaReady: vectorReady && vectorSchemaReady,
        activeAiMode,
        lastAiError,
        lastAiTestResult,
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

    async whenIdle() {
      while (pendingTasks.size > 0) {
        await Promise.allSettled(Array.from(pendingTasks))
      }
    },

    dispose() {
      db.close()
    },
  }
}
