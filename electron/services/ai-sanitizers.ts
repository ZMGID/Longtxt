/**
 * AI 响应净化、JSON 解析与 token 估算。
 *
 * 纯数据处理函数，不依赖 HTTP 层或 provider 工厂。
 */
import type {
  BlockImageAnnotation,
} from '../../shared/types'
import type {
  TagSuggestionInput,
  TagSuggestionResult,
  ChatContentPart,
  ChatMessage,
  CalendarSuggestionExtractionResult,
  TagSuggestionBatchOptions,
} from './ai-types'
import { buildBatchTagSuggestionMessages } from './ai-messages'

/* extractJsonObject 的错误格式化，保持与主模块一致 */
function formatParseError(message: string): Error {
  return new Error(message)
}

export function extractJsonObject(text: string): unknown {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() ?? text.trim()
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw formatParseError('标签 JSON 解析失败')
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
}

function normalizeSuggestedTag(tag: unknown): string {
  return typeof tag === 'string' ? tag.trim().replace(/\s+/g, ' ') : ''
}

export function sanitizeImageAnnotations(value: unknown): BlockImageAnnotation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const index = typeof item?.index === 'number' ? Math.trunc(item.index) : Number.NaN
      const annotation = typeof item?.annotation === 'string'
        ? item.annotation.trim().replace(/\s+/g, ' ').slice(0, 240)
        : ''

      if (!Number.isInteger(index) || index < 0 || !annotation) {
        return null
      }

      return { index, annotation }
    })
    .filter((item): item is BlockImageAnnotation => Boolean(item))
    .sort((left, right) => left.index - right.index)
}

export function sanitizeStructuredTags(
  payload: unknown,
  categoryCandidates: string[],
  detailCandidates: string[],
  userTags: string[],
): TagSuggestionResult {
  const data = payload as {
    categories?: unknown
    detail_tags?: unknown
    detailTags?: unknown
    summary?: unknown
    image_annotations?: unknown
    imageAnnotations?: unknown
  }
  const categorySet = new Set(categoryCandidates.map((tag) => tag.toLowerCase()))
  const detailMemorySet = new Set([...detailCandidates, ...userTags].map((tag) => tag.toLowerCase()))

  const categories = Array.isArray(data?.categories)
    ? Array.from(
        new Set(
          data.categories
            .map(normalizeSuggestedTag)
            .filter(Boolean)
            .map((tag) => {
              const matchingCategory = categoryCandidates.find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
              return matchingCategory ?? tag
            }),
        ),
      ).slice(0, 3)
    : []

  const rawDetailTags = Array.isArray(data?.detail_tags) ? data.detail_tags : Array.isArray(data?.detailTags) ? data.detailTags : []

  const detailTags = Array.from(
    new Set(
      rawDetailTags
        .map(normalizeSuggestedTag)
        .filter(Boolean)
        .map((tag) => {
          const exactMemory = [...detailCandidates, ...userTags].find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
          return exactMemory ?? tag
        }),
    ),
  )
    .filter((tag) => !categorySet.has(tag.toLowerCase()))
    .slice(0, 5)

  return {
    categories,
    detailTags: detailTags.map((tag) => {
      const memory = [...detailCandidates, ...userTags].find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
      return memory ?? (detailMemorySet.has(tag.toLowerCase()) ? tag : tag)
    }),
    summary:
      typeof data?.summary === 'string'
        ? data.summary.trim().replace(/\s+/g, ' ').slice(0, 80) || null
        : null,
    imageAnnotations: sanitizeImageAnnotations(data?.image_annotations ?? data?.imageAnnotations),
  }
}

export function sanitizeStructuredTagBatch(
  payload: unknown,
  inputs: TagSuggestionInput[],
): TagSuggestionResult[] {
  const data = payload as { items?: unknown }
  const fallback: TagSuggestionResult[] = inputs.map(() => ({
    categories: [],
    detailTags: [],
    summary: null,
    imageAnnotations: [],
  }))

  if (!Array.isArray(data?.items)) {
    return fallback
  }

  for (const item of data.items) {
    const structuredItem = item as { index?: unknown }
    const rawIndex = structuredItem.index
    const index = typeof rawIndex === 'number' ? Math.trunc(rawIndex) : Number.NaN

    if (!Number.isInteger(index) || index < 0 || index >= inputs.length) {
      continue
    }

    const input = inputs[index]
    fallback[index] = sanitizeStructuredTags(item, input.categoryCandidates, input.detailCandidates, input.userTags)
  }

  return fallback
}

function sanitizeCalendarSuggestionTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
}

function sanitizeCalendarSuggestionDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function sanitizeCalendarSuggestionTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null
}

export function sanitizeStructuredCalendarSuggestions(
  payload: unknown,
  maxSuggestions: number,
): CalendarSuggestionExtractionResult[] {
  const data = payload as { items?: unknown }

  if (!Array.isArray(data?.items) || maxSuggestions <= 0) {
    return []
  }

  const results: CalendarSuggestionExtractionResult[] = []
  const seen = new Set<string>()

  for (const item of data.items) {
    const structuredItem = item as {
      title?: unknown
      notes?: unknown
      date?: unknown
      start_time?: unknown
      startTime?: unknown
      all_day?: unknown
      allDay?: unknown
      confidence?: unknown
      evidence_text?: unknown
      evidenceText?: unknown
    }
    const title = sanitizeCalendarSuggestionTitle(structuredItem.title)
    const date = sanitizeCalendarSuggestionDate(structuredItem.date)
    const startTime = sanitizeCalendarSuggestionTime(structuredItem.start_time ?? structuredItem.startTime)

    if (!title || !date) {
      continue
    }

    const key = `${date}::${startTime ?? ''}::${title.toLowerCase()}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    results.push({
      title,
      notes:
        typeof structuredItem.notes === 'string'
          ? structuredItem.notes.trim().replace(/\s+/g, ' ').slice(0, 160) || null
          : null,
      date,
      startTime,
      allDay: typeof (structuredItem.all_day ?? structuredItem.allDay) === 'boolean'
        ? Boolean(structuredItem.all_day ?? structuredItem.allDay)
        : startTime == null,
      confidence: typeof structuredItem.confidence === 'number'
        ? Math.max(0, Math.min(1, Number(structuredItem.confidence.toFixed(3))))
        : 0.5,
      evidenceText:
        typeof (structuredItem.evidence_text ?? structuredItem.evidenceText) === 'string'
          ? String(structuredItem.evidence_text ?? structuredItem.evidenceText).trim().replace(/\s+/g, ' ').slice(0, 160) || null
          : null,
    })

    if (results.length >= maxSuggestions) {
      break
    }
  }

  return results
}

function sanitizeLongformMarkdownResponse(text: string): string {
  const withoutFence = text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const lines = withoutFence.split('\n')

  if (lines[0]?.trim().match(/^#\s+/)) {
    return lines.slice(1).join('\n').trim()
  }

  return withoutFence
}

export function sanitizeDailyReviewResponse(text: string): string {
  return sanitizeLongformMarkdownResponse(text)
}

export function sanitizeAiInsightResponse(text: string): string {
  return sanitizeLongformMarkdownResponse(text)
}

// ── Token 估算 ────────────────────────────────────────────

export function estimateTokenCount(text: string): number {
  if (!text.trim()) {
    return 0
  }

  const cjkChars = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length
  const latinWords = text.match(/[A-Za-z0-9_/-]+/g)?.length ?? 0
  const punctuationChars = text.match(/[^\sA-Za-z0-9\u3400-\u9FFF\uF900-\uFAFF]/g)?.length ?? 0
  const otherChars = Math.max(0, text.length - cjkChars - punctuationChars)

  return Math.max(
    1,
    Math.ceil(cjkChars * 1.1 + latinWords * 1.3 + punctuationChars * 0.4 + otherChars * 0.3),
  )
}

function estimateMessageContentTokens(content: string | ChatContentPart[]): number {
  if (typeof content === 'string') {
    return estimateTokenCount(content)
  }

  return content.reduce((total, part) => {
    if (part.type === 'text') {
      return total + estimateTokenCount(part.text)
    }

    return total + 256
  }, 0)
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageContentTokens(message.content) + 16, 0)
}

export function resolveApproxContextWindow(model: string): number {
  const normalized = model.trim().toLowerCase()

  if (!normalized) {
    return 32_000
  }

  if (/gpt-3\.5|deepseek-chat/.test(normalized)) {
    return 16_000
  }

  if (/gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|o1|o3|claude|gemini|qwen|max|sonnet|haiku|deepseek/.test(normalized)) {
    return 128_000
  }

  return 32_000
}

export function splitTagSuggestionInputsIntoBatches(
  inputs: TagSuggestionInput[],
  model: string,
  options: TagSuggestionBatchOptions = {},
): TagSuggestionInput[][] {
  const contextWindow = resolveApproxContextWindow(model)
  const responseReserveTokens = Math.max(256, Math.round(options.responseReserveTokens ?? 1_600))
  const maxBatchBlocks = Math.max(1, Math.round(options.maxBatchBlocks ?? 5))
  const maxPromptTokens = Math.max(2_000, contextWindow - responseReserveTokens)
  const batches: TagSuggestionInput[][] = []
  let currentBatch: TagSuggestionInput[] = []

  for (const input of inputs) {
    const candidateBatch = [...currentBatch, input]
    const candidateMessages = buildBatchTagSuggestionMessages(candidateBatch)
    const candidatePromptTokens = estimateMessageTokens(candidateMessages)

    if (currentBatch.length > 0 && (candidateBatch.length > maxBatchBlocks || candidatePromptTokens > maxPromptTokens)) {
      batches.push(currentBatch)
      currentBatch = [input]
      continue
    }

    currentBatch = candidateBatch
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}
