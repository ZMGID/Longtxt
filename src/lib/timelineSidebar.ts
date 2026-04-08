import type { Block, CalendarDaySummary } from '../../shared/types'
import { buildCalendarHeatmapColumns, type CalendarHeatmapColumn } from './calendar'
import { formatLocalDateKey } from './format'

export interface TimelineMonthCell {
  dateKey: string
  dayOfMonth: number
  inCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  count: number
  intensityLevel: number
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`)
}

function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function startOfMonth(dateKey: string): Date {
  const date = parseDateKey(dateKey)
  date.setDate(1)
  return date
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(dateKey: string, amount: number): string {
  const date = startOfMonth(dateKey)
  date.setMonth(date.getMonth() + amount)
  return formatDateKey(date)
}

function getWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

function getIntensityLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) {
    return 0
  }

  const ratio = count / maxCount

  if (ratio >= 0.8) {
    return 4
  }

  if (ratio >= 0.55) {
    return 3
  }

  if (ratio >= 0.3) {
    return 2
  }

  return 1
}

export function buildTimelineDateCountMap(blocks: Block[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const block of blocks) {
    const dateKey = formatLocalDateKey(block.createdAt)
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1)
  }

  return counts
}

export function buildTimelineMonthGrid(
  monthDateKey: string,
  selectedDateKey: string | null,
  dateCounts: Map<string, number>,
  todayDateKey = formatDateKey(new Date()),
): TimelineMonthCell[][] {
  const monthStart = startOfMonth(monthDateKey)
  const gridStart = addDays(monthStart, -getWeekdayIndex(monthStart))
  const rows: TimelineMonthCell[][] = []
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)
  monthEnd.setDate(0)
  const rowCount = Math.ceil((getWeekdayIndex(monthStart) + monthEnd.getDate()) / 7)
  let maxCount = 0

  for (let dayNumber = 1; dayNumber <= monthEnd.getDate(); dayNumber += 1) {
    const dateKey = formatDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber))
    maxCount = Math.max(maxCount, dateCounts.get(dateKey) ?? 0)
  }

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row: TimelineMonthCell[] = []

    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
      const day = addDays(gridStart, rowIndex * 7 + columnIndex)
      const dateKey = formatDateKey(day)

      row.push({
        dateKey,
        dayOfMonth: day.getDate(),
        inCurrentMonth: day.getMonth() === monthStart.getMonth(),
        isToday: dateKey === todayDateKey,
        isSelected: dateKey === selectedDateKey,
        count: dateCounts.get(dateKey) ?? 0,
        intensityLevel: getIntensityLevel(dateCounts.get(dateKey) ?? 0, maxCount),
      })
    }

    rows.push(row)
  }

  return rows
}

export function shiftTimelineMonth(monthDateKey: string, amount: number): string {
  return addMonths(monthDateKey, amount)
}

export function buildTimelineHeatmapColumns(
  dateCounts: Map<string, number>,
  anchorDateKey: string,
  totalDays = 112,
): CalendarHeatmapColumn[] {
  const anchorDate = parseDateKey(anchorDateKey)
  const daysBefore = Math.floor((totalDays - 1) / 2)
  const startDate = addDays(anchorDate, -daysBefore)
  const daySummaries: CalendarDaySummary[] = []

  let maxCount = 0

  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(startDate, index)
    const dateKey = formatDateKey(date)
    maxCount = Math.max(maxCount, dateCounts.get(dateKey) ?? 0)
  }

  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(startDate, index)
    const dateKey = formatDateKey(date)
    const count = dateCounts.get(dateKey) ?? 0

    daySummaries.push({
      date: dateKey,
      blockCount: count,
      intensityLevel: getIntensityLevel(count, maxCount),
      hasEntries: count > 0,
      hasSuggestions: false,
    })
  }

  return buildCalendarHeatmapColumns(daySummaries)
}

export function formatTimelineMonthTitle(monthDateKey: string): string {
  const date = parseDateKey(monthDateKey)
  return `${date.getMonth() + 1}月 ${date.getFullYear()}`
}
