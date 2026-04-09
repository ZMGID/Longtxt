import type { CalendarDaySummary, CalendarEntry } from '../../shared/types'
import { compareIsoDateOrTime, formatDateByLanguage, getCurrentLanguage, type AppLanguage } from '../i18n/locale'

export interface CalendarHeatmapColumn {
  key: string
  monthLabel: string | null
  days: Array<CalendarDaySummary | null>
}

export interface GroupedCalendarEntries {
  date: string
  items: CalendarEntry[]
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function getWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function buildCalendarHeatmapColumns(
  days: CalendarDaySummary[],
  language: AppLanguage = getCurrentLanguage(),
): CalendarHeatmapColumn[] {
  if (days.length === 0) {
    return []
  }

  const dayMap = new Map(days.map((day) => [day.date, day]))
  const firstDay = parseDate(days[0].date)
  const lastDay = parseDate(days[days.length - 1].date)
  const start = new Date(firstDay)
  start.setDate(start.getDate() - getWeekdayIndex(start))
  const end = new Date(lastDay)
  end.setDate(end.getDate() + (6 - getWeekdayIndex(end)))

  const columns: CalendarHeatmapColumn[] = []
  const cursor = new Date(start)
  let lastLabeledMonth = -1

  while (cursor <= end) {
    const columnDays: Array<CalendarDaySummary | null> = []
    let monthLabel: string | null = null

    for (let index = 0; index < 7; index += 1) {
      const key = formatDateKey(cursor)
      const day = dayMap.get(key) ?? null

      if (!monthLabel && day && cursor.getMonth() !== lastLabeledMonth && cursor.getDate() <= 7) {
        monthLabel = formatDateByLanguage(cursor, { month: 'short' }, language)
        lastLabeledMonth = cursor.getMonth()
      }

      columnDays.push(day)
      cursor.setDate(cursor.getDate() + 1)
    }

    columns.push({
      key: columnDays.map((day) => day?.date ?? 'empty').join('-'),
      monthLabel,
      days: columnDays,
    })
  }

  return columns
}

export function formatCalendarDateLabel(value: string): string {
  return formatDateByLanguage(parseDate(value), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function formatCalendarTimeLabel(value: string | null): string {
  if (value) {
    return value
  }

  return getCurrentLanguage() === 'en' ? 'All day' : '全天'
}

export function groupUpcomingEntries(entries: CalendarEntry[]): GroupedCalendarEntries[] {
  const groups = new Map<string, CalendarEntry[]>()

  for (const entry of entries) {
    const current = groups.get(entry.date) ?? []
    current.push(entry)
    groups.set(entry.date, current)
  }

  return Array.from(groups.entries())
    .sort((left, right) => compareIsoDateOrTime(left[0], right[0]))
    .map(([date, items]) => ({
      date,
      items,
    }))
}
