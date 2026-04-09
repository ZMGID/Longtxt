import type {
  AIConfig,
  ApiTestResult,
  CalendarEntryInput,
  CalendarEntryPatch,
  CalendarSuggestionAcceptInput,
  Notebook,
  NotebookItem,
} from '../shared/types'
import type { VectorIndexState } from './appContext-types'

export function validateContent(content: string): string {
  const trimmed = content.trim()

  if (!trimmed) {
    throw new Error('内容不能为空。')
  }

  return trimmed
}

export function normalizeCalendarDate(value: string): string {
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

export function normalizeCalendarTime(value: string | null | undefined): string | null {
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

export function normalizeCalendarTitle(title: string): string {
  const trimmed = title.trim()

  if (!trimmed) {
    throw new Error('日历标题不能为空。')
  }

  return trimmed
}

export function normalizeCalendarNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim()
  return trimmed ? trimmed : null
}

export function normalizeCalendarEntryInput(input: CalendarEntryInput): CalendarEntryInput {
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

export function normalizeCalendarEntryPatch(input: CalendarEntryPatch): CalendarEntryPatch {
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

export function normalizeCalendarSuggestionAcceptInput(input?: CalendarSuggestionAcceptInput): CalendarSuggestionAcceptInput | undefined {
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

export function todayDateKey(): string {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

export function shouldProbeCalendarSuggestions(content: string): boolean {
  return [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,
    /\b\d{1,2}\/\d{1,2}\b/,
    /\d{1,2}月\d{1,2}日/,
    /(今天|明天|后天|今晚|今早|今天下午|今天晚上|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|号前)/,
  ].some((pattern) => pattern.test(content))
}

export function normalizeNotebookTitle(title: string | undefined): string {
  const trimmed = title?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : '未命名笔记本'
}

export function normalizeNotebookTopic(notebook: Notebook, topic?: string): string {
  const trimmed = topic?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : notebook.title
}

export function buildNotebookWritingGuide(items: NotebookItem[]): string | null {
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

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(
    config.llm.endpoint.trim() &&
      config.llm.apiKey.trim() &&
      config.llm.model.trim() &&
      config.embedding.endpoint.trim() &&
      config.embedding.apiKey.trim() &&
      config.embedding.model.trim(),
  )
}

export function parseApiTestResult(raw: string | null): ApiTestResult | null {
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
      llmMultimodalOk: Boolean(parsed.llmMultimodalOk),
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

export function parseVectorIndexState(raw: string | null): VectorIndexState | null {
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

export function createMockVectorIndexState(): VectorIndexState {
  return {
    mode: 'mock',
    configFingerprint: null,
  }
}

export function createLiveVectorIndexState(configFingerprint: string): VectorIndexState {
  return {
    mode: 'live',
    configFingerprint,
  }
}

export function isSameVectorIndexState(left: VectorIndexState | null, right: VectorIndexState | null): boolean {
  if (!left || !right) {
    return left === right
  }

  return left.mode === right.mode && left.configFingerprint === right.configFingerprint
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isTransientEnrichError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /请求超时|fetch failed|network|socket|temporar|temporarily|rate limit|429|5\d\d/i.test(error.message)
}
