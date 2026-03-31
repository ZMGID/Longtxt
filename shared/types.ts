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
  createdAt: string
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
  vectorReady: boolean
  aiConfigured: boolean
  resolvedBaseUrl: string | null
  vectorDimension: number | null
  vectorSchemaReady: boolean
  activeAiMode: AIExecutionMode
  lastAiError: string | null
  lastAiTestResult: ApiTestResult | null
  tokenUsage: TokenUsage | null
}

export interface BlockChangedEvent {
  block: Block
  reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged'
}

export interface DocGenerationStart {
  requestId: string
  topic: string
  mode: AIExecutionMode
  blockIds: string[]
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
    save(topic: string, content: string, blockIds: string[]): Promise<Snapshot>
    list(query?: string): Promise<Snapshot[]>
    get(id: string): Promise<Snapshot>
    remove(id: string): Promise<void>
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
    getMeta(): Promise<AppMeta>
  }
  events: {
    onBlockChanged(listener: (event: BlockChangedEvent) => void): () => void
    onDocGenerationChunk(listener: (chunk: DocGenerationChunk) => void): () => void
  }
}
