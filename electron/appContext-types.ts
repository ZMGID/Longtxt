import type {
  AIConfig,
  AttachmentCleanupResult,
  AttachmentIndexRebuildResult,
  ApiTestResult,
  AppMeta,
  AiInsightHistoryRecord,
  AiInsightMethodId,
  AiInsightResult,
  AiInsightSnapshotInput,
  Block,
  BlockListInput,
  BlockListPage,
  BlockBatchRemoveResult,
  BlockChangedEvent,
  CalendarChangedEvent,
  CalendarDayDetail,
  CalendarEntry,
  CalendarEntryInput,
  CalendarEntryPatch,
  CalendarHeatmap,
  CalendarSuggestionAcceptInput,
  DailyReviewResult,
  DailyReviewSnapshotInput,
  DocGenerationChunk,
  DocGenerationStart,
  ExportOptions,
  ExternalAccessStatus,
  GraphEdge,
  GraphNode,
  ImportConflictStrategy,
  ImportPreview,
  Notebook,
  NotebookMutationResult,
  NotebookChangedEvent,
  MetaChangedEvent,
  NotebookReferencePreview,
  NotebookReferenceReviewState,
  NotebookStructureItemInput,
  NotebookStructureItemPatch,
  NotebookSummary,
  DataManagementOverview,
  RelatedBlockResult,
  ReviewGenerationChunk,
  ReviewGenerationStart,
  SearchResult,
  Snapshot,
  TagSuggestion,
  VectorRebuildResult,
} from '../shared/types'

export interface QueuedEnrichRequest {
  blockId: string
  content: string
  generation: number
}

export interface VectorIndexState {
  mode: 'mock' | 'live'
  configFingerprint: string | null
}

export interface AppContextOptions {
  dataDirectory: string
  settingsFilePath?: string
  cliLaunchSpec?: {
    executablePath: string
    args?: string[]
  }
  externalSkillRootDirectory?: string
  onBlockChanged?: (event: BlockChangedEvent) => void
  onNotebooksChanged?: (event: NotebookChangedEvent) => void
  onMetaChanged?: (event: MetaChangedEvent) => void
  onCalendarChanged?: (event: CalendarChangedEvent) => void
  onDocGenerationChunk?: (chunk: DocGenerationChunk) => void
  onReviewGenerationChunk?: (chunk: ReviewGenerationChunk) => void
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
  getBlocks(ids: string[]): Promise<Block[]>
  getBlockContext(id: string, options?: { before?: number; after?: number }): Promise<Block[]>
  listBlocks(params?: BlockListInput): Promise<BlockListPage>
  listBlocksByDate(date: string): Promise<Block[]>
  updateBlock(id: string, content: string): Promise<Block>
  removeBlock(id: string): Promise<void>
  removeBlocks(ids: string[]): Promise<BlockBatchRemoveResult>
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
  generateDailyReview(dateKey: string, forceRefresh?: boolean): Promise<DailyReviewResult>
  generateAiInsight(methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean): Promise<AiInsightResult>
  listAiInsightHistory(methodId?: AiInsightMethodId | null, limit?: number): Promise<AiInsightHistoryRecord[]>
  startDailyReviewGeneration(dateKey: string, forceRefresh?: boolean): Promise<ReviewGenerationStart>
  startAiInsightGeneration(methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean): Promise<ReviewGenerationStart>
  saveDailyReviewSnapshot(input: DailyReviewSnapshotInput): Promise<Snapshot>
  saveAiInsightSnapshot(input: AiInsightSnapshotInput): Promise<Snapshot>
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
  getDataManagementOverview(): Promise<DataManagementOverview>
  cleanupOrphanAttachments(): Promise<AttachmentCleanupResult>
  rebuildAttachmentIndex(): Promise<AttachmentIndexRebuildResult>
  rebuildAllVectors(): Promise<VectorRebuildResult>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  testApi(config: AIConfig): Promise<ApiTestResult>
  getMeta(): Promise<AppMeta>
  openDataDirectory(): Promise<void>
  openSettingsDirectory(): Promise<void>
  getExternalAccessStatus(): Promise<ExternalAccessStatus>
  enableExternalAccess(): Promise<ExternalAccessStatus>
  generateExternalAccessBundle(): Promise<ExternalAccessStatus>
  setupExternalAccess(): Promise<ExternalAccessStatus>
  disableExternalAccess(): Promise<ExternalAccessStatus>
  openExternalAccessDirectory(): Promise<void>
  retryFailedVectors(): Promise<number>
  whenIdle(): Promise<void>
  dispose(): void
}
