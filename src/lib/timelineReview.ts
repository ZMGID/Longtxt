import type { Block, CalendarEntry, ReviewMode } from '../../shared/types'
import { formatLocalDateKey } from './format'

export type TimelineReviewMode = ReviewMode

export const REVIEW_MODES: Array<{ id: TimelineReviewMode; label: string }> = [
  { id: 'daily-review', label: '每日回顾' },
  { id: 'ai-insights', label: 'AI 洞察' },
  { id: 'recent-shifts', label: '近期变化' },
]

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
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
}

export function extractBlockPreview(block: Block): string {
  const firstLine = block.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ?? '未命名块'
}

export function formatDeltaLabel(value: number): string {
  if (value > 0) {
    return `较前 7 天 +${value}`
  }

  if (value < 0) {
    return `较前 7 天 ${value}`
  }

  return '较前 7 天持平'
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
