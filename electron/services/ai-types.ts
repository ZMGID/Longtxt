/**
 * AI 子系统共享类型定义。
 *
 * 外部文件（tagger / docgen / review / appContext）需要的公共接口放在这里；
 * 模块间共享的内部类型也统一导出，避免循环依赖。
 */
import type {
  AppLanguage,
  Block,
  BlockImageAnnotation,
  CalendarEntryStatus,
  AiInsightMethodId,
} from '../../shared/types'

export const DEFAULT_MOCK_EMBEDDING_DIMENSION = 1536

// ── 外部使用的公共接口 ──────────────────────────────────────

export interface TagSuggestionImageInput {
  index: number
  altText: string | null
  url: string
  mimeType: string | null
}

export interface TagSuggestionBatchOptions {
  maxBatchBlocks?: number
  responseReserveTokens?: number
}

export interface CalendarSuggestionExtractionInput {
  content: string
  referenceDate: string
  timezone: string
  maxSuggestions?: number
}

export interface CalendarSuggestionExtractionResult {
  title: string
  notes: string | null
  date: string
  startTime: string | null
  allDay: boolean
  confidence: number
  evidenceText: string | null
}

export interface DailyReviewGenerationInput {
  language: AppLanguage
  date: string
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  blocks: Array<{
    id: string
    createdAt: string
    preview: string
    content: string
    summary?: string | null
    tags: string[]
  }>
  entries: Array<{
    id: string
    title: string
    notes: string | null
    startTime: string | null
    allDay: boolean
    status: CalendarEntryStatus
  }>
}

export interface AiInsightGenerationInput {
  language: AppLanguage
  methodId: AiInsightMethodId
  methodLabel: string
  promptPreset: string
  anchorDate: string
  rangeStart: string
  rangeEnd: string
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  dayDigests: Array<{
    date: string
    blockCount: number
    topTags: string[]
    previews: string[]
    plannedEntryCount: number
    doneEntryCount: number
    canceledEntryCount: number
  }>
  blocks: Array<{
    id: string
    date: string
    createdAt: string
    preview: string
    content: string
    summary?: string | null
    tags: string[]
  }>
  entries: Array<{
    id: string
    date: string
    title: string
    notes: string | null
    startTime: string | null
    allDay: boolean
    status: CalendarEntryStatus
  }>
}

export interface TokenUsageSink {
  recordRequest(kind: 'llm' | 'embedding'): void
  add(promptTokens: number, completionTokens: number): void
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>
}

export interface LLMProvider {
  streamDocument(
    topic: string,
    blocks: Block[],
    context?: { writingGuide?: string | null; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string>
  streamDailyReview(input: DailyReviewGenerationInput): AsyncGenerator<string>
  streamAiInsight(input: AiInsightGenerationInput): AsyncGenerator<string>
  suggestTags(input: TagSuggestionInput): Promise<TagSuggestionResult>
  suggestTagsBatch(inputs: TagSuggestionInput[], options?: TagSuggestionBatchOptions): Promise<TagSuggestionResult[]>
  extractCalendarSuggestions(input: CalendarSuggestionExtractionInput): Promise<CalendarSuggestionExtractionResult[]>
  generateDailyReview(input: DailyReviewGenerationInput): Promise<string>
  generateAiInsight(input: AiInsightGenerationInput): Promise<string>
}

// ── 模块间共享的内部类型 ────────────────────────────────────

export interface TagSuggestionInput {
  content: string
  categoryCandidates: string[]
  detailCandidates: string[]
  userTags: string[]
  images?: TagSuggestionImageInput[]
  skippedImages?: number
}

export interface TagSuggestionResult {
  categories: string[]
  detailTags: string[]
  summary: string | null
  imageAnnotations: BlockImageAnnotation[]
}

export interface ChatTextPart {
  type: 'text'
  text: string
}

export interface ChatImagePart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type ChatContentPart = ChatTextPart | ChatImagePart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface LLMCompletionOptions {
  stream?: boolean
  temperature?: number
  maxTokens?: number
}
