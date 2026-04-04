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
  AppMeta,
  BlockEnrichSettings,
  Block,
  BlockChangedEvent,
  CalendarChangedEvent,
  CalendarDayDetail,
  CalendarEntry,
  CalendarEntryInput,
  CalendarEntryPatch,
  CalendarHeatmap,
  CalendarSettings,
  CalendarSuggestionAcceptInput,
  DocGenerationChunk,
  DocGenerationSettings,
  DocGenerationStart,
  ExportOptions,
  GraphEdge,
  GraphNode,
  ImportConflictStrategy,
  ImportPreview,
  Notebook,
  NotebookItem,
  NotebookMutationResult,
  NotebookChangedEvent,
  MetaChangedEvent,
  NotebookReferencePreview,
  NotebookReferenceReviewState,
  NotebookStructureItemInput,
  NotebookStructureItemPatch,
  NotebookSummary,
  PaginationInput,
  RelatedBlockResult,
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
  listRecentBlockContents,
  listBlocks,
  removeTagFromBlock,
  syncAutoBlockTags,
  updateBlockContent,
  updateBlockState,
} from './db/blocks'
import {
  acceptCalendarSuggestion,
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
  type TokenUsageSink,
} from './services/ai'
import {
  selectDocumentReferenceBlocks,
  selectDocumentReferenceResults,
  streamDocumentGeneration,
} from './services/docgen'
import { createTaggerEngine } from './services/tagger'
import { cleanupOrphanAttachments, rebuildAttachmentIndex, saveImageDataUrl, syncBlockAttachmentRecords } from './services/attachments'
import { confirmImportJob, exportJsonBundle, exportMarkdownBundle, previewJsonImport, previewMarkdownImport } from './services/importExport'
import { createSettingsFileStore, resolveSettingsFilePath } from './settingsFile'

const AI_LAST_TEST_RESULT_KEY = 'ai_last_test_result'
const VECTOR_INDEX_STATE_KEY = 'vector_index_state'
const FILE_BACKED_SETTING_KEYS = new Set([
  'ai_config',
  AI_LAST_TEST_RESULT_KEY,
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DOC_GENERATION_SETTINGS_KEY,
  UI_SETTINGS_KEY,
])
const MAX_ENRICH_RETRIES = 1
const ENRICH_RETRY_DELAY_MS = 500
const TAGGER_CORPUS_LIMIT = 50
const VECTOR_REINDEX_BATCH_SIZE = 12

interface QueuedEnrichRequest {
  blockId: string
  content: string
  generation: number
}

interface VectorIndexState {
  mode: AIExecutionMode
  configFingerprint: string | null
}

export interface AppContextOptions {
  dataDirectory: string
  settingsFilePath?: string
  onBlockChanged?: (event: BlockChangedEvent) => void
  onNotebooksChanged?: (event: NotebookChangedEvent) => void
  onMetaChanged?: (event: MetaChangedEvent) => void
  onCalendarChanged?: (event: CalendarChangedEvent) => void
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
  findRelatedBlocks(blockId: string, limit?: number): Promise<RelatedBlockResult[]>
  addTag(blockId: string, tagName: string): Promise<Block>
  removeTag(blockId: string, tagId: string): Promise<Block>
  listTags(query?: string): Promise<TagSuggestion[]>
  saveImage(dataUrl: string, filenameHint?: string): Promise<{ fileUrl: string; markdownAlt: string }>
  getGraphData(tagNames?: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  searchBlocks(query: string, limit?: number): Promise<SearchResult[]>
  searchByTag(tagName: string, limit?: number): Promise<SearchResult[]>
  generateDocument(topic: string): Promise<DocGenerationStart>
  saveSnapshot(topic: string, content: string, blockIds: string[], notebookId?: string | null): Promise<Snapshot>
  listSnapshots(query?: string, notebookId?: string | null): Promise<Snapshot[]>
  getSnapshot(id: string): Promise<Snapshot>
  removeSnapshot(id: string): Promise<void>
  listCalendarYears(): Promise<number[]>
  getCalendarHeatmap(year: number): Promise<CalendarHeatmap>
  getCalendarDayDetail(date: string): Promise<CalendarDayDetail>
  listUpcomingCalendarEntries(limitDays?: number): Promise<CalendarEntry[]>
  createCalendarEntry(input: CalendarEntryInput): Promise<CalendarEntry>
  updateCalendarEntry(id: string, patch: CalendarEntryPatch): Promise<CalendarEntry>
  removeCalendarEntry(id: string): Promise<void>
  acceptCalendarSuggestion(id: string, overrides?: CalendarSuggestionAcceptInput): Promise<CalendarEntry>
  dismissCalendarSuggestion(id: string): Promise<void>
  listNotebooks(): Promise<NotebookSummary[]>
  getNotebook(id: string): Promise<Notebook>
  createNotebook(title?: string): Promise<Notebook>
  updateNotebook(id: string, title: string): Promise<Notebook>
  removeNotebook(id: string): Promise<void>
  addBlockToNotebook(notebookId: string, blockId: string): Promise<NotebookMutationResult>
  removeNotebookItem(notebookId: string, itemId: string): Promise<Notebook>
  reorderNotebookItems(notebookId: string, itemIds: string[]): Promise<Notebook>
  createNotebookBlock(notebookId: string, content: string): Promise<Notebook>
  createNotebookStructureItem(notebookId: string, input: NotebookStructureItemInput): Promise<Notebook>
  updateNotebookStructureItem(notebookId: string, itemId: string, patch: NotebookStructureItemPatch): Promise<Notebook>
  getNotebookReferencePreview(notebookId: string, topic?: string): Promise<NotebookReferencePreview>
  updateNotebookReferenceReview(
    notebookId: string,
    blockId: string,
    patch: Partial<Pick<NotebookReferenceReviewState, 'excluded' | 'locked' | 'pinned'>>,
    topic?: string,
  ): Promise<NotebookReferencePreview>
  generateNotebookDocument(notebookId: string, topic?: string): Promise<DocGenerationStart>
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
  openSettingsDirectory(): Promise<void>
  retryFailedVectors(): Promise<number>
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

function normalizeCalendarDate(value: string): string {
  const trimmed = value.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('日期格式无效，应为 YYYY-MM-DD。')
  }

  const date = new Date(`${trimmed}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    throw new Error('日期无效。')
  }

  return trimmed
}

function normalizeCalendarTime(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw new Error('时间格式无效，应为 HH:mm。')
  }

  return trimmed
}

function normalizeCalendarTitle(title: string): string {
  const trimmed = title.trim()

  if (!trimmed) {
    throw new Error('日历标题不能为空。')
  }

  return trimmed
}

function normalizeCalendarNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim()
  return trimmed ? trimmed : null
}

function normalizeCalendarEntryInput(input: CalendarEntryInput): CalendarEntryInput {
  const allDay = input.allDay ?? !input.startTime

  return {
    title: normalizeCalendarTitle(input.title),
    date: normalizeCalendarDate(input.date),
    notes: normalizeCalendarNotes(input.notes),
    startTime: allDay ? null : normalizeCalendarTime(input.startTime),
    allDay,
    linkedBlockId: input.linkedBlockId ?? null,
  }
}

function normalizeCalendarEntryPatch(input: CalendarEntryPatch): CalendarEntryPatch {
  const nextPatch: CalendarEntryPatch = {}

  if (input.title !== undefined) {
    nextPatch.title = normalizeCalendarTitle(input.title)
  }

  if (input.date !== undefined) {
    nextPatch.date = normalizeCalendarDate(input.date)
  }

  if (input.notes !== undefined) {
    nextPatch.notes = normalizeCalendarNotes(input.notes)
  }

  if (input.startTime !== undefined) {
    nextPatch.startTime = normalizeCalendarTime(input.startTime)
  }

  if (input.allDay !== undefined) {
    nextPatch.allDay = input.allDay
    if (input.allDay) {
      nextPatch.startTime = null
    }
  }

  if (input.status !== undefined) {
    nextPatch.status = input.status
  }

  return nextPatch
}

function normalizeCalendarSuggestionAcceptInput(input?: CalendarSuggestionAcceptInput): CalendarSuggestionAcceptInput | undefined {
  if (!input) {
    return undefined
  }

  const nextInput: CalendarSuggestionAcceptInput = {}

  if (input.title !== undefined) {
    nextInput.title = normalizeCalendarTitle(input.title)
  }

  if (input.date !== undefined) {
    nextInput.date = normalizeCalendarDate(input.date)
  }

  if (input.notes !== undefined) {
    nextInput.notes = normalizeCalendarNotes(input.notes)
  }

  if (input.startTime !== undefined) {
    nextInput.startTime = normalizeCalendarTime(input.startTime)
  }

  if (input.allDay !== undefined) {
    nextInput.allDay = input.allDay
    if (input.allDay) {
      nextInput.startTime = null
    }
  }

  if (input.linkedBlockId !== undefined) {
    nextInput.linkedBlockId = input.linkedBlockId
  }

  return nextInput
}

function todayDateKey(): string {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function shouldProbeCalendarSuggestions(content: string): boolean {
  return [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,
    /\b\d{1,2}\/\d{1,2}\b/,
    /\d{1,2}月\d{1,2}日/,
    /(今天|明天|后天|今晚|今早|今天下午|今天晚上|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|号前)/,
  ].some((pattern) => pattern.test(content))
}

function normalizeNotebookTitle(title: string | undefined): string {
  const trimmed = title?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : '未命名笔记本'
}

function normalizeNotebookTopic(notebook: Notebook, topic?: string): string {
  const trimmed = topic?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : notebook.title
}

function buildNotebookWritingGuide(items: NotebookItem[]): string | null {
  const guideLines = items.flatMap((item) => {
    switch (item.type) {
      case 'heading':
        return item.content.trim() ? [`- 章节标题：${item.content.trim()}`] : []
      case 'divider':
        return ['- 分隔线：这里需要一个简洁的段落切换或章节过渡。']
      case 'note':
        return item.content.trim() ? [`- 注释：${item.content.trim()}`] : []
      case 'todo':
        return item.content.trim()
          ? [`- 待办${item.checked ? '（已完成，可酌情吸收）' : '（优先处理）'}：${item.content.trim()}`]
          : []
      default:
        return []
    }
  })

  return guideLines.length > 0 ? guideLines.join('\n') : null
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

function parseVectorIndexState(raw: string | null): VectorIndexState | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VectorIndexState>

    if (parsed.mode !== 'mock' && parsed.mode !== 'live') {
      return null
    }

    return {
      mode: parsed.mode,
      configFingerprint: typeof parsed.configFingerprint === 'string' ? parsed.configFingerprint : null,
    }
  } catch {
    return null
  }
}

function createMockVectorIndexState(): VectorIndexState {
  return {
    mode: 'mock',
    configFingerprint: null,
  }
}

function createLiveVectorIndexState(configFingerprint: string): VectorIndexState {
  return {
    mode: 'live',
    configFingerprint,
  }
}

function isSameVectorIndexState(left: VectorIndexState | null, right: VectorIndexState | null): boolean {
  if (!left || !right) {
    return left === right
  }

  return left.mode === right.mode && left.configFingerprint === right.configFingerprint
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientEnrichError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /请求超时|fetch failed|network|socket|temporar|temporarily|rate limit|429|5\d\d/i.test(error.message)
}

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
  const pendingTasks = new Set<Promise<unknown>>()
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

  // 累计 token 用量（自程序启动后）
  let modelCallCounts = { llm: 0, embedding: 0 }
  let tokenUsageAccum = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 }
  const tokenSink: TokenUsageSink = {
    recordRequest(kind) {
      modelCallCounts = {
        llm: modelCallCounts.llm + Number(kind === 'llm'),
        embedding: modelCallCounts.embedding + Number(kind === 'embedding'),
      }
      tokenUsageAccum = {
        ...tokenUsageAccum,
        requestCount: tokenUsageAccum.requestCount + 1,
      }
      emitMetaChanged({
        reason: 'usage',
      })
    },
    add(promptTokens, completionTokens) {
      if (promptTokens === 0 && completionTokens === 0) {
        return
      }

      tokenUsageAccum = {
        promptTokens: tokenUsageAccum.promptTokens + promptTokens,
        completionTokens: tokenUsageAccum.completionTokens + completionTokens,
        totalTokens: tokenUsageAccum.totalTokens + promptTokens + completionTokens,
        requestCount: tokenUsageAccum.requestCount,
      }
      emitMetaChanged({
        reason: 'usage',
      })
    },
  }

  void trackTask(rebuildAttachmentIndex(db, options.dataDirectory))

  function emitBlockChanged(event: BlockChangedEvent): void {
    options.onBlockChanged?.(event)
  }

  function emitNotebooksChanged(event: NotebookChangedEvent): void {
    options.onNotebooksChanged?.(event)
  }

  function emitMetaChanged(event: MetaChangedEvent): void {
    options.onMetaChanged?.(event)
  }

  function emitCalendarChanged(event: CalendarChangedEvent): void {
    options.onCalendarChanged?.(event)
  }

  function emitDocGenerationChunk(chunk: DocGenerationChunk): void {
    options.onDocGenerationChunk?.(chunk)
  }

  function emitTouchedNotebooks(
    notebookIds: string[],
    reason: NotebookChangedEvent['reason'],
  ): void {
    if (notebookIds.length === 0) {
      return
    }

    emitNotebooksChanged({
      notebookIds,
      reason,
    })
  }

  function trackTask<T>(task: Promise<T>): Promise<T> {
    pendingTasks.add(task)
    void task.catch(() => undefined)
    void task.finally(() => {
      pendingTasks.delete(task)
    })
    return task
  }

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

      replaceCalendarSuggestionsForBlock(
        db,
        blockId,
        suggestions.map((suggestion) => ({
          title: suggestion.title,
          notes: suggestion.notes,
          date: suggestion.date,
          startTime: suggestion.startTime,
          allDay: suggestion.allDay,
          confidence: suggestion.confidence,
          evidenceText: suggestion.evidenceText,
        })),
        new Date().toISOString(),
      )

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
      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))

      return getBlockById(db, id)
    },

    async removeBlock(id) {
      advanceBlockEnrichGeneration(id)
      emitTouchedNotebooks(touchNotebooksForBlock(db, id, new Date().toISOString()), 'block-unlinked')
      const deletedBlock = deleteBlockRecord(db, id)

      if (vectorReady) {
        deleteBlockVector(db, id)
      }

      removePendingBlockVectors(db, [id])
      removeFailedBlockVector(db, id)
      emitMetaChanged({
        reason: 'vector-queue',
      })

      emitBlockChanged({
        block: deletedBlock,
        reason: 'deleted',
      })

      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))
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
        (async () => {
          try {
            for await (const chunk of streamDocumentGeneration(requestId, safeTopic, blocks, llmProvider, mode, {
              temperature,
              maxTokens: maxOutputTokens,
            })) {
              if (mode === 'live' && chunk.delta) {
                clearRuntimeAiError()
              }

              emitDocGenerationChunk(chunk)
            }

            emitMetaChanged({
              reason: 'doc-generation',
            })
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
            emitMetaChanged({
              reason: 'doc-generation',
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
        (async () => {
          try {
            for await (const chunk of streamDocumentGeneration(
              requestId,
              safeTopic,
              selectedBlocks,
              llmProvider,
              mode,
              { writingGuide, temperature, maxTokens: maxOutputTokens },
            )) {
              if (mode === 'live' && chunk.delta) {
                clearRuntimeAiError()
              }

              emitDocGenerationChunk(chunk)
            }

            emitMetaChanged({
              reason: 'doc-generation',
            })
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
            emitMetaChanged({
              reason: 'doc-generation',
            })
          }
        })(),
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

      const result = await confirmImportJob(db, options.dataDirectory, job, conflictStrategy)
      importJobs.delete(importId)
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

      void trackTask(cleanupOrphanAttachments(db, options.dataDirectory))
      return result
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
        modelCallCounts: { ...modelCallCounts },
        tokenUsage: tokenUsageAccum.requestCount > 0 ? { ...tokenUsageAccum } : null,
        failedVectorCount: countFailedBlockVectors(db),
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
