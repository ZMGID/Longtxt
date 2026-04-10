export type BlockStatus = 'pending' | 'ready' | 'error' | 'skipped'

export type BlockProcessingErrorCode = 'too_large' | 'timeout' | 'provider_error' | 'cancelled' | 'disabled' | 'interrupted'

export type AIExecutionMode = 'mock' | 'live'

export type MatchSource = 'tag' | 'fts' | 'vector'

export type TagSource = 'auto' | 'manual'

export type TagKind = 'category' | 'detail' | 'user'

export type CalendarEntryStatus = 'planned' | 'done' | 'canceled'

export type CalendarEntrySource = 'manual' | 'ai-accepted'

export type AppLanguage = 'zh' | 'en'

export interface Tag {
  id: string
  name: string
  isDefault: boolean
  source: TagSource
  kind: TagKind
}

export interface TagSuggestion {
  id: string
  name: string
  isDefault: boolean
  kind: TagKind
}

export interface BlockImageAnnotation {
  index: number
  annotation: string
}

export interface Block {
  id: string
  content: string
  summary?: string | null
  imageAnnotations?: BlockImageAnnotation[] | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
  status: BlockStatus
  aiMode: AIExecutionMode
  errorMessage?: string | null
  errorCode?: BlockProcessingErrorCode | null
}

export interface BlockBatchRemoveResult {
  removed: number
  removedIds: string[]
}

export interface RelatedBlockResult {
  block: Block
  score: number
}

export interface SearchResult {
  block: Block
  score: number
  matchSource: MatchSource[]
  preview?: string | null
}

export interface GraphNode {
  id: string
  label: string
  summary?: string | null
  tags: string[]
  color: string
  size: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  sharedTags: string[]
}

export interface Snapshot {
  id: string
  topic: string
  content: string
  blockIds: string[]
  tags?: Tag[]
  notebookId?: string | null
  notebookTitle?: string | null
  createdAt: string
  updatedAt: string
}

export interface SnapshotUpdateInput {
  topic: string
  content: string
}

export type ReviewMode = 'daily-review' | 'ai-insights' | 'recent-shifts'

export type AiInsightMethodId =
  | 'default-insight'
  | 'values-clarification'
  | 'reverse-thinking'
  | 'second-order-thinking'
  | 'cbt-patterns'
  | 'mbti-analysis'

export interface DailyReviewSourceBlock {
  id: string
  preview: string
  createdAt: string
  updatedAt: string
  tags: string[]
  summary?: string | null
}

export interface DailyReviewResult {
  date: string
  title: string
  summary: string | null
  content: string
  blockIds: string[]
  calendarEntryIds: string[]
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  generatedAt: string
  mode: AIExecutionMode
  sourceBlocks: DailyReviewSourceBlock[]
  empty: boolean
}

export interface DailyReviewSnapshotInput {
  title: string
  content: string
  blockIds: string[]
}

export interface AiInsightSourceBlock extends DailyReviewSourceBlock {
  date: string
}

export interface AiInsightResult {
  methodId: AiInsightMethodId
  date: string
  rangeStart: string
  rangeEnd: string
  title: string
  summary: string | null
  content: string
  blockIds: string[]
  calendarEntryIds: string[]
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  generatedAt: string
  mode: AIExecutionMode
  sourceBlocks: AiInsightSourceBlock[]
  empty: boolean
}

export interface AiInsightSnapshotInput {
  methodId: AiInsightMethodId
  date: string
  rangeStart: string
  rangeEnd: string
  title: string
  content: string
  blockIds: string[]
}

export interface AiInsightHistoryRecord {
  id: string
  methodId: AiInsightMethodId
  date: string
  rangeStart: string
  rangeEnd: string
  title: string
  content: string
  blockIds: string[]
  mode: AIExecutionMode
  empty: boolean
  createdAt: string
}

export interface NotebookSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  itemCount: number
  blockCount: number
  structureCount: number
}

export type NotebookItemType = 'block' | 'heading' | 'divider' | 'note' | 'todo'
export type NotebookStructureItemType = Exclude<NotebookItemType, 'block'>
export type NotebookReferenceSelectionReason = 'pinned' | 'locked' | 'strong' | 'weak' | 'not-selected'

export interface NotebookItemBase {
  id: string
  type: NotebookItemType
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface NotebookBlockItem extends NotebookItemBase {
  type: 'block'
  blockId: string
  block: Block
}

export interface NotebookHeadingItem extends NotebookItemBase {
  type: 'heading'
  content: string
}

export interface NotebookDividerItem extends NotebookItemBase {
  type: 'divider'
}

export interface NotebookNoteItem extends NotebookItemBase {
  type: 'note'
  content: string
}

export interface NotebookTodoItem extends NotebookItemBase {
  type: 'todo'
  content: string
  checked: boolean
}

export type NotebookItem =
  | NotebookBlockItem
  | NotebookHeadingItem
  | NotebookDividerItem
  | NotebookNoteItem
  | NotebookTodoItem

export interface Notebook {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  itemCount: number
  blockCount: number
  structureCount: number
  items: NotebookItem[]
}

export interface NotebookMutationResult {
  notebook: Notebook
  added: boolean
}

export interface NotebookStructureItemInput {
  type: NotebookStructureItemType
  content?: string
  checked?: boolean
}

export interface NotebookStructureItemPatch {
  content?: string
  checked?: boolean
}

export interface NotebookReferenceReviewState {
  blockId: string
  excluded: boolean
  locked: boolean
  pinned: boolean
  updatedAt: string | null
}

export interface NotebookReferenceCandidate extends SearchResult {
  notebookItemId: string
  selected: boolean
  selectionReason: NotebookReferenceSelectionReason
  review: NotebookReferenceReviewState
}

export interface NotebookReferencePreview {
  notebookId: string
  topic: string
  maxReferenceBlocks: number
  candidateCount: number
  selectedCount: number
  candidates: NotebookReferenceCandidate[]
}

export interface ExportOptions {
  tagFilter?: string[]
  dateRange?: {
    start?: string
    end?: string
  }
  includeAttachments: boolean
  includeSettings?: boolean
  targetPath?: string | null
}

export type RendererExportOptions = Omit<ExportOptions, 'targetPath'>

export interface ImportPreview {
  importId: string
  format: 'markdown' | 'json'
  totalFiles: number
  totalBlocks: number
  conflicts: number
  includesSettings?: boolean
  settingsEntryCount?: number
  samples: Array<{
    filename: string
    preview: string
  }>
}

export type ImportConflictStrategy = 'skip_all' | 'overwrite_all'

export interface AIEndpointConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface AIConfig {
  llm: AIEndpointConfig
  embedding: AIEndpointConfig
  multimodalImageAnalysisEnabled: boolean
}

export interface DocGenerationSettings {
  maxReferenceBlocks: number
  retrievalLimit: number
  temperature: number
  maxOutputTokens: number
  streamOutput: boolean
}

export interface BlockEnrichSettings {
  queueEnabled: boolean
  maxBatchBlocks: number
  queueDebounceMs: number
  responseReserveTokens: number
}

export interface UISettings {
  showMiniTimeline: boolean
  language: AppLanguage
}

export interface CalendarSettings {
  aiSuggestionsEnabled: boolean
  autoAcceptAiSuggestions: boolean
  maxSuggestionsPerBlock: number
  upcomingDays: number
}

export type ExternalAccessSkillTarget = 'claude-code'

export interface ExternalAccessSettings {
  enabled: boolean
  generatedAt: string | null
  skillTarget: ExternalAccessSkillTarget
}

export interface ExternalAccessStatus {
  enabled: boolean
  available: boolean
  generatedAt: string | null
  skillTarget: ExternalAccessSkillTarget
  cliPath: string
  cliDirectory: string
  guidesDirectory: string
  integrationReadmePath: string
  integrationReadmeExists: boolean
  agentGuidePath: string
  agentGuideExists: boolean
  commandsGuidePath: string
  workflowsGuidePath: string
  examplesDirectory: string
  adaptersDirectory: string
  skillDirectory: string
  executablePath: string
  executableExists: boolean
  cliExists: boolean
  skillExists: boolean
  doctorCommand: string
  searchCommandExample: string
  issues: string[]
}

export interface BlockListCursor {
  createdAt: string
  id: string
}

export interface BlockListInput {
  limit?: number
  cursor?: BlockListCursor | null
}

export interface BlockListPage {
  items: Block[]
  nextCursor: BlockListCursor | null
  hasMore: boolean
}

export interface ApiTestResult {
  success: boolean
  modelsOk: boolean
  embeddingOk: boolean
  llmOk: boolean
  llmStreamingOk: boolean
  llmMultimodalOk: boolean
  resolvedBaseUrl: string
  embeddingModel: string
  embeddingDimension: number | null
  chatModel: string
  error?: string
  checkedAt: string
  configFingerprint?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  requestCount: number
}

export interface ModelCallCounts {
  llm: number
  embedding: number
}

export interface AppMeta {
  dataDirectory: string
  totalBlockCount: number
  vectorReady: boolean
  aiConfigured: boolean
  resolvedBaseUrl: string | null
  vectorDimension: number | null
  vectorSchemaReady: boolean
  activeAiMode: AIExecutionMode
  lastAiError: string | null
  lastAiTestResult: ApiTestResult | null
  modelCallCounts: ModelCallCounts
  tokenUsage: TokenUsage | null
  lifetimeTokenUsage: TokenUsage | null
  failedVectorCount: number
  pendingVectorCount: number
  vectorQueueProcessing: boolean
  pendingBlockCount?: number
  skippedBlockCount?: number
  oversizedSkippedBlockCount?: number
  backgroundProcessingPaused?: boolean
  recoveryModeActive?: boolean
  startupRecoveredBlockCount?: number
}

export interface DataManagementOverview {
  dataDirectory: string
  databasePath: string
  settingsDirectory: string
  settingsFilePath: string
  totalBlockCount: number
  totalNotebookCount: number
  totalSnapshotCount: number
  totalAttachmentCount: number
  totalVectorCount: number
  vectorReady: boolean
  aiConfigured: boolean
  activeAiMode: AIExecutionMode
  vectorDimension: number | null
  vectorSchemaReady: boolean
  failedVectorCount: number
  pendingVectorCount: number
  vectorQueueProcessing: boolean
  tokenUsage: TokenUsage | null
  pendingBlockCount?: number
  skippedBlockCount?: number
  oversizedSkippedBlockCount?: number
  backgroundProcessingPaused?: boolean
  recoveryModeActive?: boolean
  startupRecoveredBlockCount?: number
}

export interface AttachmentCleanupResult {
  removedCount: number
}

export interface AttachmentIndexRebuildResult {
  indexedBlockCount: number
  attachmentCount: number
  removedOrphanCount: number
}

export interface VectorRebuildResult {
  queuedBlockCount: number
}

export interface CalendarDaySummary {
  date: string
  blockCount: number
  intensityLevel: number
  hasEntries: boolean
  hasSuggestions: boolean
}

export interface CalendarHeatmap {
  year: number
  totalContributions: number
  maxBlockCount: number
  days: CalendarDaySummary[]
}

export interface CalendarEntry {
  id: string
  title: string
  notes: string | null
  date: string
  startTime: string | null
  allDay: boolean
  status: CalendarEntryStatus
  source: CalendarEntrySource
  linkedBlockId: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarSuggestion {
  id: string
  title: string
  notes: string | null
  date: string
  startTime: string | null
  allDay: boolean
  sourceBlockId: string
  confidence: number
  evidenceText: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarDayDetail {
  date: string
  blockCount: number
  blocks: Block[]
  entries: CalendarEntry[]
  suggestions: CalendarSuggestion[]
}

export interface CalendarEntryInput {
  title: string
  date: string
  notes?: string | null
  startTime?: string | null
  allDay?: boolean
  linkedBlockId?: string | null
}

export interface CalendarEntryPatch {
  title?: string
  date?: string
  notes?: string | null
  startTime?: string | null
  allDay?: boolean
  status?: CalendarEntryStatus
}

export interface CalendarSuggestionAcceptInput {
  title?: string
  date?: string
  notes?: string | null
  startTime?: string | null
  allDay?: boolean
  linkedBlockId?: string | null
}

export type BlockChangeReason = 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged'

export interface BlockChangedEvent {
  block: Block
  reason: BlockChangeReason
}

export interface LightweightBlockChangedEvent {
  blockId: string
  reason: BlockChangeReason
}

export interface AppEventBatch {
  blockChanges: LightweightBlockChangedEvent[]
  blockPayloads: Record<string, Block>
  notebookChanges: NotebookChangedEvent[]
  metaChanges: MetaChangedEvent[]
  calendarChanges: CalendarChangedEvent[]
}

export interface NotebookChangedEvent {
  notebookIds: string[]
  reason: 'created' | 'updated' | 'deleted' | 'items-changed' | 'block-linked' | 'block-unlinked' | 'reference-review-updated'
}

export interface MetaChangedEvent {
  reason: 'settings' | 'ai-test' | 'vector-queue' | 'vector-failure' | 'vector-retry' | 'doc-generation' | 'review-generation' | 'usage' | 'calendar-suggestion' | 'data-management' | 'quit'
}

export interface AppQuitStateChangedEvent {
  waiting: boolean
}

export interface CalendarChangedEvent {
  reason: 'entry-created' | 'entry-updated' | 'entry-deleted' | 'suggestion-updated'
  date?: string
  sourceBlockId?: string
}

export interface DocGenerationStart {
  requestId: string
  topic: string
  mode: AIExecutionMode
  blockIds: string[]
  notebookId?: string | null
}

export interface DocGenerationChunk {
  requestId: string
  topic: string
  delta: string
  done: boolean
  mode: AIExecutionMode
  fullText?: string
  error?: string
}

export interface ReviewGenerationStart {
  requestId: string
  kind: 'daily-review' | 'ai-insight'
  date: string
  methodId?: AiInsightMethodId
  mode: AIExecutionMode
}

export interface ReviewGenerationChunk {
  requestId: string
  kind: 'daily-review' | 'ai-insight'
  date: string
  methodId?: AiInsightMethodId
  delta: string
  done: boolean
  mode: AIExecutionMode
  fullText?: string
  error?: string
}

export interface ChangbuApi {
  blocks: {
    create(content: string): Promise<Block>
    get(id: string): Promise<Block>
    getMany(ids: string[]): Promise<Block[]>
    getContext(id: string, options?: { before?: number; after?: number }): Promise<Block[]>
    list(params?: BlockListInput): Promise<BlockListPage>
    listByDate(date: string): Promise<Block[]>
    update(id: string, content: string): Promise<Block>
    remove(id: string): Promise<void>
    removeMany(ids: string[]): Promise<BlockBatchRemoveResult>
    findRelated(blockId: string, limit?: number): Promise<RelatedBlockResult[]>
  }
  attachments: {
    saveImage(dataUrl: string, filenameHint?: string): Promise<{ fileUrl: string; markdownAlt: string }>
  }
  graph: {
    getData(tagNames?: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  }
  search: {
    blocks(query: string, limit?: number): Promise<SearchResult[]>
    byTag(tagName: string, limit?: number): Promise<SearchResult[]>
    generate(topic: string): Promise<DocGenerationStart>
  }
  snapshots: {
    save(topic: string, content: string, blockIds: string[], notebookId?: string | null): Promise<Snapshot>
    update(id: string, patch: SnapshotUpdateInput): Promise<Snapshot>
    list(query?: string, notebookId?: string | null): Promise<Snapshot[]>
    get(id: string): Promise<Snapshot>
    remove(id: string): Promise<void>
  }
  calendar: {
    listYears(): Promise<number[]>
    getYearHeatmap(year: number): Promise<CalendarHeatmap>
    getDayDetail(date: string): Promise<CalendarDayDetail>
    listUpcoming(limitDays?: number): Promise<CalendarEntry[]>
    createEntry(input: CalendarEntryInput): Promise<CalendarEntry>
    updateEntry(id: string, patch: CalendarEntryPatch): Promise<CalendarEntry>
    removeEntry(id: string): Promise<void>
    acceptSuggestion(suggestionId: string, overrides?: CalendarSuggestionAcceptInput): Promise<CalendarEntry>
    dismissSuggestion(suggestionId: string): Promise<void>
  }
  notebooks: {
    list(): Promise<NotebookSummary[]>
    get(id: string): Promise<Notebook>
    create(title?: string): Promise<Notebook>
    update(id: string, title: string): Promise<Notebook>
    remove(id: string): Promise<void>
    addBlock(notebookId: string, blockId: string): Promise<NotebookMutationResult>
    removeItem(notebookId: string, itemId: string): Promise<Notebook>
    reorderItems(notebookId: string, itemIds: string[]): Promise<Notebook>
    createBlock(notebookId: string, content: string): Promise<Notebook>
    createStructureItem(notebookId: string, input: NotebookStructureItemInput): Promise<Notebook>
    updateStructureItem(notebookId: string, itemId: string, patch: NotebookStructureItemPatch): Promise<Notebook>
    getReferencePreview(notebookId: string, topic?: string): Promise<NotebookReferencePreview>
    updateReferenceReview(
      notebookId: string,
      blockId: string,
      patch: Partial<Pick<NotebookReferenceReviewState, 'excluded' | 'locked' | 'pinned'>>,
      topic?: string,
    ): Promise<NotebookReferencePreview>
    generateDocument(notebookId: string, topic?: string): Promise<DocGenerationStart>
  }
  exports: {
    markdown(options: RendererExportOptions): Promise<{ path: string; count: number } | null>
    json(options: RendererExportOptions): Promise<{ path: string; count: number } | null>
  }
  imports: {
    previewMarkdown(): Promise<ImportPreview | null>
    previewJson(): Promise<ImportPreview | null>
    confirm(importId: string, conflictStrategy: ImportConflictStrategy): Promise<{ imported: number }>
  }
  data: {
    getOverview(): Promise<DataManagementOverview>
    cleanupOrphanAttachments(): Promise<AttachmentCleanupResult>
    rebuildAttachmentIndex(): Promise<AttachmentIndexRebuildResult>
    rebuildAllVectors(): Promise<VectorRebuildResult>
    setBackgroundProcessingPaused(paused: boolean): Promise<{ paused: boolean }>
    clearPendingVectors(): Promise<number>
    clearFailedVectors(): Promise<number>
  }
  review: {
    openWindow(mode: ReviewMode, dateKey?: string): Promise<void>
    generateDaily(dateKey: string, forceRefresh?: boolean): Promise<DailyReviewResult>
    generateInsight(methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean): Promise<AiInsightResult>
    listInsightHistory(methodId?: AiInsightMethodId | null, limit?: number): Promise<AiInsightHistoryRecord[]>
    startDailyGeneration(dateKey: string, forceRefresh?: boolean): Promise<ReviewGenerationStart>
    startInsightGeneration(methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean): Promise<ReviewGenerationStart>
    saveDailySnapshot(input: DailyReviewSnapshotInput): Promise<Snapshot>
    saveInsightSnapshot(input: AiInsightSnapshotInput): Promise<Snapshot>
  }
  tags: {
    add(blockId: string, tagName: string): Promise<Block>
    remove(blockId: string, tagId: string): Promise<Block>
    list(query?: string): Promise<TagSuggestion[]>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    testApi(config: AIConfig): Promise<ApiTestResult>
    openWindow(): Promise<void>
    openDataDirectory(): Promise<void>
    openSettingsDirectory(): Promise<void>
    getMeta(): Promise<AppMeta>
    getExternalAccessStatus(): Promise<ExternalAccessStatus>
    enableExternalAccess(): Promise<ExternalAccessStatus>
    generateExternalAccessBundle(): Promise<ExternalAccessStatus>
    setupExternalAccess(): Promise<ExternalAccessStatus>
    disableExternalAccess(): Promise<ExternalAccessStatus>
    openExternalAccessDirectory(): Promise<void>
  }
  vectors: {
    retryFailed(): Promise<number>
  }
  events: {
    onBatch(listener: (batch: AppEventBatch) => void): () => void
    onBlockChanged(listener: (event: BlockChangedEvent) => void): () => void
    onNotebooksChanged(listener: (event: NotebookChangedEvent) => void): () => void
    onMetaChanged(listener: (event: MetaChangedEvent) => void): () => void
    onCalendarChanged(listener: (event: CalendarChangedEvent) => void): () => void
    onDocGenerationChunk(listener: (chunk: DocGenerationChunk) => void): () => void
    onReviewGenerationChunk(listener: (chunk: ReviewGenerationChunk) => void): () => void
    onQuitStateChanged(listener: (state: AppQuitStateChangedEvent) => void): () => void
  }
}
