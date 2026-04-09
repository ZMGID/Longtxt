import type { Block, CalendarEntry, ReviewMode } from '../../shared/types'
import { resolveMessage, type MessageKey } from '../i18n/messages'
import { compareText, getCurrentLanguage, type AppLanguage } from '../i18n/locale'
import { formatLocalDateKey } from './format'

export type TimelineReviewMode = ReviewMode

export const REVIEW_MODES: TimelineReviewMode[] = [
  'daily-review',
  'ai-insights',
  'recent-shifts',
]

export function getTimelineReviewModeMessageKey(mode: TimelineReviewMode): MessageKey {
  if (mode === 'daily-review') {
    return 'review.mode.daily'
  }

  if (mode === 'ai-insights') {
    return 'review.mode.aiInsights'
  }

  return 'review.mode.recentShifts'
}

export function getTimelineReviewModeLabel(
  mode: TimelineReviewMode,
  language: AppLanguage = getCurrentLanguage(),
): string {
  return resolveMessage(getTimelineReviewModeMessageKey(mode), language)
}

export function shiftDateKey(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function summarizeTagCounts(sourceBlocks: Block[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()

  for (const block of sourceBlocks) {
    for (const tag of block.tags) {
      counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || compareText(left.name, right.name))
}

export function extractBlockPreview(
  block: Block,
  language: AppLanguage = getCurrentLanguage(),
): string {
  const firstLine = block.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ?? (language === 'en' ? 'Untitled block' : '未命名块')
}

export function formatDeltaLabel(
  value: number,
  language: AppLanguage = getCurrentLanguage(),
): string {
  if (value > 0) {
    return language === 'en' ? `vs previous 7 days +${value}` : `较前 7 天 +${value}`
  }

  if (value < 0) {
    return language === 'en' ? `vs previous 7 days ${value}` : `较前 7 天 ${value}`
  }

  return language === 'en' ? 'Flat vs previous 7 days' : '较前 7 天持平'
}

export function buildTimelineReviewDateRange(anchorDateKey: string): string[] {
  const startDateKey = shiftDateKey(anchorDateKey, -13)
  const dates: string[] = []

  for (let offset = 0; offset < 14; offset += 1) {
    dates.push(shiftDateKey(startDateKey, offset))
  }

  return dates
}

export function buildTimelineReviewData(blocks: Block[], entries: CalendarEntry[], anchorDateKey: string) {
  const selectedDayBlocks = blocks.filter((block) => formatLocalDateKey(block.createdAt) === anchorDateKey)
  const selectedDayTags = summarizeTagCounts(selectedDayBlocks).slice(0, 4)
  const selectedDayEntries = entries.filter((entry) => entry.date === anchorDateKey)

  const reviewWindowStart = shiftDateKey(anchorDateKey, -6)
  const previousWindowStart = shiftDateKey(anchorDateKey, -13)
  const previousWindowEnd = shiftDateKey(anchorDateKey, -7)

  const reviewWindowBlocks = blocks.filter((block) => {
    const dateKey = formatLocalDateKey(block.createdAt)
    return dateKey >= reviewWindowStart && dateKey <= anchorDateKey
  })

  const previousWindowBlocks = blocks.filter((block) => {
    const dateKey = formatLocalDateKey(block.createdAt)
    return dateKey >= previousWindowStart && dateKey <= previousWindowEnd
  })

  const reviewWindowEntries = entries.filter((entry) => entry.date >= reviewWindowStart && entry.date <= anchorDateKey)
  const reviewWindowTags = summarizeTagCounts(reviewWindowBlocks).slice(0, 5)

  const dayCounts = new Map<string, number>()

  for (const block of reviewWindowBlocks) {
    const dateKey = formatLocalDateKey(block.createdAt)
    dayCounts.set(dateKey, (dayCounts.get(dateKey) ?? 0) + 1)
  }

  const busiestReviewDay = Array.from(dayCounts.entries())
    .map(([dateKey, count]) => ({ dateKey, count }))
    .sort((left, right) => right.count - left.count || right.dateKey.localeCompare(left.dateKey))[0] ?? null

  const reviewWindowPlannedCount = reviewWindowEntries.filter((entry) => entry.status === 'planned').length
  const reviewWindowDoneCount = reviewWindowEntries.filter((entry) => entry.status === 'done').length

  return {
    selectedDayBlocks,
    selectedDayTags,
    selectedDayEntries,
    reviewWindowStart,
    reviewWindowEntries,
    previousWindowBlocks,
    reviewWindowBlocks,
    reviewWindowTags,
    busiestReviewDay,
    reviewWindowPlannedCount,
    reviewWindowDoneCount,
  }
}
