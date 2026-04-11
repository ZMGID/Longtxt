/**
 * 日历、回顾与 AI 洞察模块
 *
 * 提供日历条目 CRUD、每日回顾生成、AI 洞察生成、
 * 流式回顾事件发送等公共方法。
 */

import { v4 as uuid } from 'uuid'

import { isAiInsightMethodId } from '../shared/aiInsights'
import type {
  AIExecutionMode,
  AiInsightMethodId,
  AppLanguage,
  CalendarEntry,
  CalendarEntryInput,
  CalendarEntryPatch,
  CalendarSuggestionAcceptInput,
  ReviewGenerationChunk,
  ReviewGenerationStart,
} from '../shared/types'
import {
  acceptCalendarSuggestion,
  createCalendarEntry,
  dismissCalendarSuggestion,
  getCalendarDayDetail,
  getCalendarHeatmap,
  listCalendarYears,
  listUpcomingCalendarEntries,
  removeCalendarEntry,
  updateCalendarEntry,
} from './db/calendar'
import { createAiInsightHistoryRecord, listAiInsightHistoryRecords } from './db/aiInsightHistory'
import { createSnapshot } from './db/snapshots'
import {
  generateDailyReview as generateDailyReviewContent,
  generateAiInsight as generateAiInsightContent,
  prepareDailyReviewGeneration,
  prepareAiInsightGeneration,
  finalizeDailyReviewResult,
  finalizeAiInsightResult,
  buildReviewDateRange,
  buildDailyReviewSnapshotContent,
  buildAiInsightSnapshotContent,
} from './services/review'
import { normalizeCalendarDate, normalizeCalendarEntryInput, normalizeCalendarEntryPatch, normalizeCalendarSuggestionAcceptInput, todayDateKey, validateContent } from './appContext-utils'
import type { EmbeddingProvider, LLMProvider } from './services/ai'

export interface CalendarDeps {
  db: import('better-sqlite3').Database
  emitCalendarChanged: (event: import('../shared/types').CalendarChangedEvent) => void
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  emitReviewGenerationChunk: (chunk: ReviewGenerationChunk) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  getProviders: () => { mode: AIExecutionMode; embeddingProvider: EmbeddingProvider; llmProvider: LLMProvider }
  getCalendarSettings: () => { aiSuggestionsEnabled: boolean; maxSuggestionsPerBlock: number; autoAcceptAiSuggestions: boolean; upcomingDays: number }
  getUiSettings: () => { language: AppLanguage }
  getExecutionMode: () => AIExecutionMode
  clearRuntimeAiError: () => boolean
  rememberRuntimeAiError: (error: unknown) => void
  t: (zh: string, en: string) => string
  getSavedConfigFingerprint: () => string | null
  /** 每日回顾缓存 */
  dailyReviewCache: Map<string, Awaited<ReturnType<typeof generateDailyReviewContent>>>
  /** AI 洞察缓存 */
  aiInsightCache: Map<string, Awaited<ReturnType<typeof generateAiInsightContent>>>
}

export interface CalendarModule {
  getDailyReviewCacheKey: (dateKey: string, language: AppLanguage) => string
  getAiInsightCacheKey: (methodId: string, dateKey: string, language: AppLanguage) => string
  clearDailyReviewCache: () => void
  recordAiInsightHistory: (result: Awaited<ReturnType<typeof generateAiInsightContent>>) => void
  emitReviewChunk: (chunk: ReviewGenerationChunk) => void
  buildDailyReviewStart: (requestId: string, date: string, mode: AIExecutionMode) => ReviewGenerationStart
  buildAiInsightStart: (requestId: string, methodId: AiInsightMethodId, date: string, mode: AIExecutionMode) => ReviewGenerationStart
  emitDailyReviewResultChunk: (start: ReviewGenerationStart, result: Awaited<ReturnType<typeof generateDailyReviewContent>>) => void
  emitAiInsightResultChunk: (start: ReviewGenerationStart, result: Awaited<ReturnType<typeof generateAiInsightContent>>) => void
  listCalendarYears: () => Promise<number[]>
  getCalendarHeatmap: (year: number) => Promise<Awaited<ReturnType<typeof getCalendarHeatmap>>>
  getCalendarDayDetail: (date: string) => Promise<Awaited<ReturnType<typeof getCalendarDayDetail>>>
  generateDailyReview: (dateKey: string, forceRefresh?: boolean) => Promise<Awaited<ReturnType<typeof generateDailyReviewContent>>>
  generateAiInsight: (methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean) => Promise<Awaited<ReturnType<typeof generateAiInsightContent>>>
  listAiInsightHistory: (methodId?: AiInsightMethodId | null, limit?: number) => Promise<Awaited<ReturnType<typeof listAiInsightHistoryRecords>>>
  startDailyReviewGeneration: (dateKey: string, forceRefresh?: boolean) => Promise<ReviewGenerationStart>
  startAiInsightGeneration: (methodId: AiInsightMethodId, dateKey: string, forceRefresh?: boolean) => Promise<ReviewGenerationStart>
  saveDailyReviewSnapshot: (input: { title: string; content: string; blockIds: string[] }) => Promise<Awaited<ReturnType<typeof createSnapshot>>>
  saveAiInsightSnapshot: (input: { methodId: string; title: string; content: string; blockIds: string[] }) => Promise<Awaited<ReturnType<typeof createSnapshot>>>
  listUpcomingCalendarEntries: (limitDays?: number) => Promise<CalendarEntry[]>
  createCalendarEntry: (input: CalendarEntryInput) => Promise<CalendarEntry>
  updateCalendarEntry: (id: string, patch: CalendarEntryPatch) => Promise<CalendarEntry>
  removeCalendarEntry: (id: string) => Promise<void>
  acceptCalendarSuggestion: (id: string, overrides?: CalendarSuggestionAcceptInput) => Promise<CalendarEntry>
  dismissCalendarSuggestion: (id: string) => Promise<void>
}

export function createCalendarModule(deps: CalendarDeps): CalendarModule {
  const {
    db,
    emitCalendarChanged,
    emitMetaChanged,
    emitReviewGenerationChunk,
    trackTask,
    getProviders,
    getCalendarSettings,
    getUiSettings,
    getExecutionMode,
    clearRuntimeAiError,
    rememberRuntimeAiError,
    t,
    getSavedConfigFingerprint,
    dailyReviewCache,
    aiInsightCache,
  } = deps

  /** 构建每日回顾缓存 key */
  function getDailyReviewCacheKey(dateKey: string, language: AppLanguage): string {
    const configFingerprint = getSavedConfigFingerprint()
    return `${normalizeCalendarDate(dateKey)}::${language}::${getExecutionMode()}::${configFingerprint ?? 'no-config'}`
  }

  /** 构建 AI 洞察缓存 key */
  function getAiInsightCacheKey(methodId: string, dateKey: string, language: AppLanguage): string {
    const configFingerprint = getSavedConfigFingerprint()
    return `${methodId}::${normalizeCalendarDate(dateKey)}::${language}::${getExecutionMode()}::${configFingerprint ?? 'no-config'}`
  }

  /** 清空回顾和洞察缓存 */
  function clearDailyReviewCache(): void {
    dailyReviewCache.clear()
    aiInsightCache.clear()
  }

  /** 将 AI 洞察结果写入历史记录 */
  function recordAiInsightHistory(result: Awaited<ReturnType<typeof generateAiInsightContent>>): void {
    createAiInsightHistoryRecord(db, {
      methodId: result.methodId,
      date: result.date,
      rangeStart: result.rangeStart,
      rangeEnd: result.rangeEnd,
      title: result.title,
      content: result.content,
      blockIds: result.blockIds,
      mode: result.mode,
      empty: result.empty,
    })
  }

  /** 发送回顾生成事件 */
  function emitReviewChunk(chunk: ReviewGenerationChunk): void {
    emitReviewGenerationChunk(chunk)
  }

  /** 构建每日回顾流式生成启动信号 */
  function buildDailyReviewStart(requestId: string, date: string, mode: AIExecutionMode): ReviewGenerationStart {
    return {
      requestId,
      kind: 'daily-review',
      date,
      mode,
    }
  }

  /** 构建 AI 洞察流式生成启动信号 */
  function buildAiInsightStart(
    requestId: string,
    methodId: AiInsightMethodId,
    date: string,
    mode: AIExecutionMode,
  ): ReviewGenerationStart {
    return {
      requestId,
      kind: 'ai-insight',
      date,
      methodId,
      mode,
    }
  }

  /** 发送每日回顾完成事件 */
  function emitDailyReviewResultChunk(start: ReviewGenerationStart, result: Awaited<ReturnType<typeof generateDailyReviewContent>>): void {
    emitReviewChunk({
      requestId: start.requestId,
      kind: 'daily-review',
      date: start.date,
      delta: '',
      done: true,
      mode: start.mode,
      fullText: result.content,
    })
  }

  /** 发送 AI 洞察完成事件 */
  function emitAiInsightResultChunk(start: ReviewGenerationStart, result: Awaited<ReturnType<typeof generateAiInsightContent>>): void {
    emitReviewChunk({
      requestId: start.requestId,
      kind: 'ai-insight',
      date: start.date,
      methodId: start.methodId,
      delta: '',
      done: true,
      mode: start.mode,
      fullText: result.content,
    })
  }

  return {
    getDailyReviewCacheKey,
    getAiInsightCacheKey,
    clearDailyReviewCache,
    recordAiInsightHistory,
    emitReviewChunk,
    buildDailyReviewStart,
    buildAiInsightStart,
    emitDailyReviewResultChunk,
    emitAiInsightResultChunk,

    async listCalendarYears() {
      return listCalendarYears(db)
    },

    async getCalendarHeatmap(year) {
      return getCalendarHeatmap(db, year)
    },

    async getCalendarDayDetail(date) {
      return getCalendarDayDetail(db, normalizeCalendarDate(date))
    },

    async generateDailyReview(dateKey, forceRefresh = false) {
      const normalizedDate = normalizeCalendarDate(dateKey)
      const language = getUiSettings().language
      const cacheKey = getDailyReviewCacheKey(normalizedDate, language)

      if (!forceRefresh) {
        const cached = dailyReviewCache.get(cacheKey)

        if (cached) {
          return cached
        }
      }

      const task = (async () => {
        const { mode, llmProvider } = getProviders()
        const dayDetail = getCalendarDayDetail(db, normalizedDate)

        try {
          const result = await generateDailyReviewContent({
            date: normalizedDate,
            dayDetail,
            llmProvider,
            mode,
            language,
          })

          dailyReviewCache.set(cacheKey, result)

          if (mode === 'live' && clearRuntimeAiError()) {
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          return result
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          throw error
        }
      })()

      return trackTask(task)
    },

    async generateAiInsight(methodId, dateKey, forceRefresh = false) {
      if (!isAiInsightMethodId(methodId)) {
        throw new Error(t('未知的 AI 洞察方法。', 'Unknown AI insight method.'))
      }

      const normalizedDate = normalizeCalendarDate(dateKey)
      const language = getUiSettings().language
      const cacheKey = getAiInsightCacheKey(methodId, normalizedDate, language)

      if (!forceRefresh) {
        const cached = aiInsightCache.get(cacheKey)

        if (cached) {
          return cached
        }
      }

      const task = (async () => {
        const { mode, llmProvider } = getProviders()
        const dates = buildReviewDateRange(normalizedDate)
        const dayDetails = dates.map((date) => getCalendarDayDetail(db, date))

        try {
          const result = await generateAiInsightContent({
            methodId,
            anchorDate: normalizedDate,
            dayDetails,
            llmProvider,
            mode,
            language,
          })

          aiInsightCache.set(cacheKey, result)
          recordAiInsightHistory(result)

          if (mode === 'live' && clearRuntimeAiError()) {
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          return result
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          throw error
        }
      })()

      return trackTask(task)
    },

    async listAiInsightHistory(methodId = null, limit = 30) {
      if (methodId !== null && methodId !== undefined && !isAiInsightMethodId(methodId)) {
        throw new Error(t('未知的 AI 洞察方法。', 'Unknown AI insight method.'))
      }

      return listAiInsightHistoryRecords(db, methodId ?? null, limit)
    },

    async startDailyReviewGeneration(dateKey, forceRefresh = false) {
      const normalizedDate = normalizeCalendarDate(dateKey)
      const language = getUiSettings().language
      const cacheKey = getDailyReviewCacheKey(normalizedDate, language)
      const { mode, llmProvider } = getProviders()
      const requestId = uuid()
      const start = buildDailyReviewStart(requestId, normalizedDate, mode)

      if (!forceRefresh) {
        const cached = dailyReviewCache.get(cacheKey)

        if (cached) {
          setTimeout(() => {
            emitDailyReviewResultChunk(start, cached)
          }, 0)
          return start
        }
      }

      void trackTask((async () => {
        await Promise.resolve()
        const dayDetail = getCalendarDayDetail(db, normalizedDate)
        const prepared = prepareDailyReviewGeneration({
          date: normalizedDate,
          dayDetail,
          mode,
          language,
        })

        if (prepared.emptyResult) {
          dailyReviewCache.set(cacheKey, prepared.emptyResult)
          setTimeout(() => {
            emitDailyReviewResultChunk(start, prepared.emptyResult as Awaited<ReturnType<typeof generateDailyReviewContent>>)
          }, 0)
          return
        }

        const generationInput = prepared.input

        if (!generationInput) {
          throw new Error(t('每日回顾生成输入缺失。', 'Missing daily review generation input.'))
        }

        try {
          let fullText = ''

          for await (const delta of llmProvider.streamDailyReview(generationInput)) {
            fullText += delta
            emitReviewChunk({
              requestId,
              kind: 'daily-review',
              date: normalizedDate,
              delta,
              done: false,
              mode,
            })
          }

          const result = finalizeDailyReviewResult({
            date: normalizedDate,
            mode,
            language,
            input: generationInput,
            blocks: prepared.blocks,
            entries: prepared.entries,
            content: fullText,
          })

          dailyReviewCache.set(cacheKey, result)

          if (mode === 'live' && clearRuntimeAiError()) {
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          emitDailyReviewResultChunk(start, result)
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          emitReviewChunk({
            requestId,
            kind: 'daily-review',
            date: normalizedDate,
            delta: '',
            done: true,
            mode,
            error: error instanceof Error ? error.message : t('每日回顾生成失败。', 'Daily review generation failed.'),
          })
        }
      })())

      return start
    },

    async startAiInsightGeneration(methodId, dateKey, forceRefresh = false) {
      if (!isAiInsightMethodId(methodId)) {
        throw new Error(t('未知的 AI 洞察方法。', 'Unknown AI insight method.'))
      }

      const normalizedDate = normalizeCalendarDate(dateKey)
      const language = getUiSettings().language
      const cacheKey = getAiInsightCacheKey(methodId, normalizedDate, language)
      const { mode, llmProvider } = getProviders()
      const requestId = uuid()
      const start = buildAiInsightStart(requestId, methodId, normalizedDate, mode)

      if (!forceRefresh) {
        const cached = aiInsightCache.get(cacheKey)

        if (cached) {
          setTimeout(() => {
            emitAiInsightResultChunk(start, cached)
          }, 0)
          return start
        }
      }

      void trackTask((async () => {
        await Promise.resolve()
        const dates = buildReviewDateRange(normalizedDate)
        const dayDetails = dates.map((date) => getCalendarDayDetail(db, date))
        const prepared = prepareAiInsightGeneration({
          methodId,
          anchorDate: normalizedDate,
          dayDetails,
          mode,
          language,
        })

        if (prepared.emptyResult) {
          aiInsightCache.set(cacheKey, prepared.emptyResult)
          recordAiInsightHistory(prepared.emptyResult)
          setTimeout(() => {
            emitAiInsightResultChunk(start, prepared.emptyResult as Awaited<ReturnType<typeof generateAiInsightContent>>)
          }, 0)
          return
        }

        const generationInput = prepared.input

        if (!generationInput) {
          throw new Error(t('AI 洞察生成输入缺失。', 'Missing AI insight generation input.'))
        }

        try {
          let fullText = ''

          for await (const delta of llmProvider.streamAiInsight(generationInput)) {
            fullText += delta
            emitReviewChunk({
              requestId,
              kind: 'ai-insight',
              date: normalizedDate,
              methodId,
              delta,
              done: false,
              mode,
            })
          }

          const result = finalizeAiInsightResult({
            methodId,
            anchorDate: normalizedDate,
            mode,
            language,
            input: generationInput,
            blocks: prepared.blocks,
            entries: prepared.entries,
            sourceBlocks: prepared.sourceBlocks,
            content: fullText,
          })

          aiInsightCache.set(cacheKey, result)
          recordAiInsightHistory(result)

          if (mode === 'live' && clearRuntimeAiError()) {
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          emitAiInsightResultChunk(start, result)
        } catch (error) {
          if (mode === 'live') {
            rememberRuntimeAiError(error)
            emitMetaChanged({
              reason: 'review-generation',
            })
          }

          emitReviewChunk({
            requestId,
            kind: 'ai-insight',
            date: normalizedDate,
            methodId,
            delta: '',
            done: true,
            mode,
            error: error instanceof Error ? error.message : t('AI 洞察生成失败。', 'AI insight generation failed.'),
          })
        }
      })())

      return start
    },

    async saveDailyReviewSnapshot(input) {
      const safeTitle = validateContent(input.title)
      const snapshotContent = buildDailyReviewSnapshotContent(safeTitle, input.content, getUiSettings().language)
      return createSnapshot(db, safeTitle, validateContent(snapshotContent), input.blockIds)
    },

    async saveAiInsightSnapshot(input) {
      if (!isAiInsightMethodId(input.methodId)) {
        throw new Error(t('未知的 AI 洞察方法。', 'Unknown AI insight method.'))
      }

      const safeTitle = validateContent(input.title)
      const snapshotContent = buildAiInsightSnapshotContent(safeTitle, input.content, getUiSettings().language)
      return createSnapshot(db, safeTitle, validateContent(snapshotContent), input.blockIds)
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
      clearDailyReviewCache()
      emitCalendarChanged({
        reason: 'entry-created',
        date: entry.date,
      })
      return entry
    },

    async updateCalendarEntry(id, patch) {
      const entry = updateCalendarEntry(db, id, normalizeCalendarEntryPatch(patch), new Date().toISOString())
      clearDailyReviewCache()
      emitCalendarChanged({
        reason: 'entry-updated',
        date: entry.date,
      })
      return entry
    },

    async removeCalendarEntry(id) {
      removeCalendarEntry(db, id)
      clearDailyReviewCache()
      emitCalendarChanged({
        reason: 'entry-deleted',
      })
    },

    async acceptCalendarSuggestion(id, overrides) {
      const entry = acceptCalendarSuggestion(db, id, normalizeCalendarSuggestionAcceptInput(overrides), new Date().toISOString())
      clearDailyReviewCache()
      emitCalendarChanged({
        reason: 'suggestion-updated',
        date: entry.date,
        sourceBlockId: entry.linkedBlockId ?? undefined,
      })
      return entry
    },

    async dismissCalendarSuggestion(id) {
      dismissCalendarSuggestion(db, id)
      clearDailyReviewCache()
      emitCalendarChanged({
        reason: 'suggestion-updated',
      })
    },
  }
}
