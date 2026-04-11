import type { CSSProperties } from 'react'

import type { CalendarEntry } from '../../../shared/types'
import { formatDateByLanguage } from '../../i18n/locale'
import type { AppLanguage } from '../../i18n/locale'
import { buildCalendarHeatmapColumns } from '../../lib/calendar'

export interface CalendarEntryDraft {
  title: string
  date: string
  allDay: boolean
  startTime: string
  notes: string
}

export type CalendarLayoutMode = 'two-pane' | 'single-pane'
export type CalendarDetailTab = 'entries' | 'suggestions' | 'blocks'
export type CalendarSidebarTab = 'create' | 'upcoming'
export type HeatmapDisplayMode = 'full-year' | 'focused-window'

export const INTENSITY_CLASSES = [
  'bg-stone-100',
  'bg-emerald-100',
  'bg-emerald-200',
  'bg-emerald-400',
  'bg-emerald-700',
] as const

export const SIDEBAR_COLLAPSE_BREAKPOINT = 1120
export const INLINE_SIDEBAR_TAB_BREAKPOINT = 760
export const HEATMAP_FOCUSED_WINDOW_BREAKPOINT = 680

export function clampIndicatorSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolveLayoutMode(width: number): CalendarLayoutMode {
  return width < SIDEBAR_COLLAPSE_BREAKPOINT ? 'single-pane' : 'two-pane'
}

export function shouldUseSidebarTabs(width: number): boolean {
  return width < INLINE_SIDEBAR_TAB_BREAKPOINT
}

export function todayDateKey(): string {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getColumnAnchorDate(column: ReturnType<typeof buildCalendarHeatmapColumns>[number]): string | null {
  return column.days.find((day) => day)?.date ?? null
}

export function getColumnMonthFallbackLabel(
  column: ReturnType<typeof buildCalendarHeatmapColumns>[number],
  language: AppLanguage,
): string | null {
  const anchorDate = getColumnAnchorDate(column)

  if (!anchorDate) {
    return null
  }

  return formatDateByLanguage(new Date(`${anchorDate}T00:00:00`), { month: 'short' }, language)
}

export function buildEntryDraft(date: string): CalendarEntryDraft {
  return {
    title: '',
    date,
    allDay: true,
    startTime: '',
    notes: '',
  }
}

export function buildEntryPayload(draft: CalendarEntryDraft) {
  return {
    title: draft.title,
    date: draft.date,
    allDay: draft.allDay,
    startTime: draft.allDay ? null : draft.startTime || null,
    notes: draft.notes || null,
  }
}

export function formatBlockTime(value: string): string {
  return formatDateByLanguage(new Date(value), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function entryStatusLabel(status: CalendarEntry['status'], copy: { statusPlanned: string; statusDone: string; statusCanceled: string }): string {
  if (status === 'done') {
    return copy.statusDone
  }

  if (status === 'canceled') {
    return copy.statusCanceled
  }

  return copy.statusPlanned
}

export function computeHeatmapStyles(cellSize: number, gapSize: number): CSSProperties {
  return {
    '--calendar-cell-size': `${cellSize}px`,
    '--calendar-cell-gap': `${gapSize}px`,
  } as CSSProperties
}

export function computeEntryIndicatorStyle(cellSize: number): CSSProperties {
  return {
    width: `${clampIndicatorSize(Math.round(cellSize * 0.62), 3, 10)}px`,
    height: `${clampIndicatorSize(Math.round(cellSize * 0.18), 2, 3)}px`,
  }
}

export function computeSuggestionIndicatorStyle(cellSize: number): CSSProperties {
  const size = clampIndicatorSize(Math.round(cellSize * 0.34), 3, 6)

  return {
    height: `${size}px`,
    width: `${size}px`,
  }
}
