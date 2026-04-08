import type {
  BlockChangedEvent,
  CalendarChangedEvent,
  DocGenerationChunk,
  MetaChangedEvent,
  NotebookChangedEvent,
  ReviewGenerationChunk,
  TokenUsage,
} from '../shared/types'
import type { TokenUsageSink } from './services/ai'
import type { AppContextOptions } from './appContext-types'

const EMPTY_TOKEN_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  requestCount: 0,
}

function toNonNegativeInteger(value: unknown): number {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0
  }

  return Math.trunc(numericValue)
}

function normalizeTokenUsage(value: unknown): TokenUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_TOKEN_USAGE }
  }

  const promptTokens = toNonNegativeInteger((value as Partial<TokenUsage>).promptTokens)
  const completionTokens = toNonNegativeInteger((value as Partial<TokenUsage>).completionTokens)
  const requestCount = toNonNegativeInteger((value as Partial<TokenUsage>).requestCount)
  const totalTokens = Math.max(
    promptTokens + completionTokens,
    toNonNegativeInteger((value as Partial<TokenUsage>).totalTokens),
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    requestCount,
  }
}

export function parseTokenUsage(raw: string | null | undefined): TokenUsage {
  if (!raw?.trim()) {
    return { ...EMPTY_TOKEN_USAGE }
  }

  try {
    return normalizeTokenUsage(JSON.parse(raw))
  } catch {
    return { ...EMPTY_TOKEN_USAGE }
  }
}

export function createPendingTaskTracker() {
  const pendingTasks = new Set<Promise<unknown>>()

  function trackTask<T>(task: Promise<T>): Promise<T> {
    pendingTasks.add(task)
    void task.catch(() => undefined)
    void task.finally(() => {
      pendingTasks.delete(task)
    })
    return task
  }

  return {
    pendingTasks,
    trackTask,
  }
}

export function createContextEventEmitters(options: AppContextOptions) {
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

  function emitReviewGenerationChunk(chunk: ReviewGenerationChunk): void {
    options.onReviewGenerationChunk?.(chunk)
  }

  function emitTouchedNotebooks(notebookIds: string[], reason: NotebookChangedEvent['reason']): void {
    if (notebookIds.length === 0) {
      return
    }

    emitNotebooksChanged({
      notebookIds,
      reason,
    })
  }

  return {
    emitBlockChanged,
    emitNotebooksChanged,
    emitMetaChanged,
    emitCalendarChanged,
    emitDocGenerationChunk,
    emitReviewGenerationChunk,
    emitTouchedNotebooks,
  }
}

export function createUsageTracker(options: {
  emitMetaChanged: (event: MetaChangedEvent) => void
  initialLifetimeUsage?: TokenUsage | null
  persistLifetimeUsage?: (usage: TokenUsage) => void
}): {
  tokenSink: TokenUsageSink
  getModelCallCounts: () => { llm: number; embedding: number }
  getTokenUsage: () => { promptTokens: number; completionTokens: number; totalTokens: number; requestCount: number }
  getLifetimeTokenUsage: () => { promptTokens: number; completionTokens: number; totalTokens: number; requestCount: number }
} {
  const { emitMetaChanged, initialLifetimeUsage, persistLifetimeUsage } = options
  let modelCallCounts = { llm: 0, embedding: 0 }
  let tokenUsageAccum = { ...EMPTY_TOKEN_USAGE }
  let lifetimeTokenUsageAccum = normalizeTokenUsage(initialLifetimeUsage)

  function emitUsageChanged(): void {
    persistLifetimeUsage?.(lifetimeTokenUsageAccum)
    emitMetaChanged({
      reason: 'usage',
    })
  }

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
      lifetimeTokenUsageAccum = {
        ...lifetimeTokenUsageAccum,
        requestCount: lifetimeTokenUsageAccum.requestCount + 1,
      }
      emitUsageChanged()
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
      lifetimeTokenUsageAccum = {
        promptTokens: lifetimeTokenUsageAccum.promptTokens + promptTokens,
        completionTokens: lifetimeTokenUsageAccum.completionTokens + completionTokens,
        totalTokens: lifetimeTokenUsageAccum.totalTokens + promptTokens + completionTokens,
        requestCount: lifetimeTokenUsageAccum.requestCount,
      }
      emitUsageChanged()
    },
  }

  return {
    tokenSink,
    getModelCallCounts: () => ({ ...modelCallCounts }),
    getTokenUsage: () => ({ ...tokenUsageAccum }),
    getLifetimeTokenUsage: () => ({ ...lifetimeTokenUsageAccum }),
  }
}
