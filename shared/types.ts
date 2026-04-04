export type BlockStatus = 'pending' | 'ready' | 'error'

export type AIExecutionMode = 'mock' | 'live'

export type MatchSource = 'tag' | 'fts' | 'vector'

export type TagSource = 'auto' | 'manual'

export type TagKind = 'category' | 'detail' | 'user'

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

export interface Block {
  id: string
  content: string
  summary?: string | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
  status: BlockStatus
  aiMode: AIExecutionMode
  errorMessage?: string | null
}

export interface RelatedBlockResult {
  block: Block
  score: number
}

export interface SearchResult {
  block: Block
  score: number
  matchSource: MatchSource[]
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
  notebookId?: string | null
  notebookTitle?: string | null
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
  targetPath?: string | null
}

export interface ImportPreview {
  importId: string
  format: 'markdown' | 'json'
  totalFiles: number
  totalBlocks: number
  conflicts: number
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
}

export interface DocGenerationSettings {
  maxReferenceBlocks: number
}

export interface UISettings {
  showMiniTimeline: boolean
}

export interface PaginationInput {
  offset?: number
  limit?: number
}

export interface ApiTestResult {
  success: boolean
  modelsOk: boolean
  embeddingOk: boolean
  llmOk: boolean
  llmStreamingOk: boolean
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
  tokenUsage: TokenUsage | null
  failedVectorCount: number
}

export interface BlockChangedEvent {
  block: Block
  reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged'
}

export interface NotebookChangedEvent {
  notebookIds: string[]
  reason: 'created' | 'updated' | 'deleted' | 'items-changed' | 'block-linked' | 'block-unlinked' | 'reference-review-updated'
}

export interface MetaChangedEvent {
  reason: 'settings' | 'ai-test' | 'vector-queue' | 'vector-failure' | 'vector-retry' | 'doc-generation'
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

export interface ChangbuApi {
  blocks: {
    create(content: string): Promise<Block>
    get(id: string): Promise<Block>
    list(params?: PaginationInput): Promise<Block[]>
    update(id: string, content: string): Promise<Block>
    remove(id: string): Promise<void>
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
    list(query?: string, notebookId?: string | null): Promise<Snapshot[]>
    get(id: string): Promise<Snapshot>
    remove(id: string): Promise<void>
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
    markdown(options: ExportOptions): Promise<{ path: string; count: number } | null>
    json(options: ExportOptions): Promise<{ path: string; count: number } | null>
  }
  imports: {
    previewMarkdown(filePaths?: string[]): Promise<ImportPreview | null>
    previewJson(filePath?: string): Promise<ImportPreview | null>
    confirm(importId: string, conflictStrategy: ImportConflictStrategy): Promise<{ imported: number }>
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
    openDataDirectory(): Promise<void>
    openSettingsDirectory(): Promise<void>
    getMeta(): Promise<AppMeta>
  }
  vectors: {
    retryFailed(): Promise<number>
  }
  events: {
    onBlockChanged(listener: (event: BlockChangedEvent) => void): () => void
    onNotebooksChanged(listener: (event: NotebookChangedEvent) => void): () => void
    onMetaChanged(listener: (event: MetaChangedEvent) => void): () => void
    onDocGenerationChunk(listener: (chunk: DocGenerationChunk) => void): () => void
  }
}
