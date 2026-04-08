import { useEffect, useMemo, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { Block, CalendarEntry } from '../../shared/types'
import { useUpcomingCalendarEntries } from '../hooks/useCalendar'
import { formatDateKeyLabel } from '../lib/format'
import { changbu } from '../lib/changbu'
import { formatCalendarTimeLabel } from '../lib/calendar'
import { queryKeys } from '../lib/queryKeys'
import { REVIEW_MODES, type TimelineReviewMode } from '../lib/timelineReview'
import {
  buildTimelineDateCountMap,
  buildTimelineMonthGrid,
  formatTimelineMonthTitle,
  shiftTimelineMonth,
} from '../lib/timelineSidebar'

interface TimelineSidebarProps {
  blocks: Block[]
  upcomingDays: number
  activeDateKey: string | null
  onSelectDate: (dateKey: string) => void
  onOpenCalendarDate: (dateKey: string) => void
  onOpenReview: (mode: TimelineReviewMode, dateKey: string) => void
}

type TimelineSidebarMode = 'scheduled-todo' | 'review'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const MONTH_INTENSITY_COLORS = [
  'transparent',
  '#f2f8f5',
  '#e8f3ec',
  '#dcece2',
  '#cfe4d8',
] as const
const SIDEBAR_MODES: Array<{ id: TimelineSidebarMode; label: string }> = [
  { id: 'scheduled-todo', label: 'TODO' },
  { id: 'review', label: '回顾' },
]

function todayDateKey(): string {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function compareScheduledEntries(left: CalendarEntry, right: CalendarEntry): number {
  const dateOrder = left.date.localeCompare(right.date)

  if (dateOrder !== 0) {
    return dateOrder
  }

  if (left.allDay !== right.allDay) {
    return left.allDay ? 1 : -1
  }

  return (left.startTime ?? '').localeCompare(right.startTime ?? '')
}

function formatTodoMeta(entry: CalendarEntry): string {
  return `${entry.date.slice(5).replace('-', '/')} · ${entry.allDay ? '全天' : formatCalendarTimeLabel(entry.startTime)}`
}

export function TimelineSidebar({
  blocks,
  upcomingDays,
  activeDateKey,
  onSelectDate,
  onOpenCalendarDate,
  onOpenReview,
}: TimelineSidebarProps) {
  const queryClient = useQueryClient()
  const today = todayDateKey()
  const initialMonthDateKey = activeDateKey ?? today
  const asideRef = useRef<HTMLElement | null>(null)
  const [visibleMonthDateKey, setVisibleMonthDateKey] = useState(initialMonthDateKey)
  const [sidebarHeight, setSidebarHeight] = useState(0)
  const [activeMode, setActiveMode] = useState<TimelineSidebarMode>('scheduled-todo')
  const [entryActionId, setEntryActionId] = useState<string | null>(null)
  const dateCounts = useMemo(() => buildTimelineDateCountMap(blocks), [blocks])
  const upcomingQuery = useUpcomingCalendarEntries(upcomingDays)
  const monthGrid = useMemo(
    () => buildTimelineMonthGrid(visibleMonthDateKey, activeDateKey, dateCounts, today),
    [activeDateKey, dateCounts, today, visibleMonthDateKey],
  )
  const plannedEntries = useMemo(
    () => (upcomingQuery.data ?? [])
      .filter((entry) => entry.status === 'planned')
      .slice()
      .sort(compareScheduledEntries),
    [upcomingQuery.data],
  )
  const monthRowCount = monthGrid.length
  const compactMode = sidebarHeight > 0 && sidebarHeight < 820
  const calendarCellHeight = compactMode ? 40 : 44
  const calendarFillHeight = compactMode ? 32 : 36
  const calendarFillWidth = compactMode ? 28 : 32
  const visibleTodoCount = sidebarHeight > 0 && sidebarHeight < 740 ? 3 : sidebarHeight > 0 && sidebarHeight < 900 ? 4 : 5
  const visibleEntries = plannedEntries.slice(0, visibleTodoCount)
  const hiddenEntryCount = Math.max(0, plannedEntries.length - visibleEntries.length)

  useEffect(() => {
    if (!activeDateKey) {
      return
    }

    setVisibleMonthDateKey(`${activeDateKey.slice(0, 7)}-01`)
  }, [activeDateKey])

  useEffect(() => {
    const node = asideRef.current

    if (!node) {
      return
    }

    if (typeof ResizeObserver === 'undefined') {
      setSidebarHeight(node.getBoundingClientRect().height)
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setSidebarHeight(entry.contentRect.height)
    })

    observer.observe(node)
    setSidebarHeight(node.getBoundingClientRect().height)

    return () => {
      observer.disconnect()
    }
  }, [])

  async function refreshCalendar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
  }

  async function updateEntryStatus(id: string, status: CalendarEntry['status']): Promise<void> {
    setEntryActionId(id)

    try {
      await changbu.calendar.updateEntry(id, { status })
      await refreshCalendar()
    } finally {
      setEntryActionId(null)
    }
  }

  return (
    <aside
      ref={asideRef}
      data-testid="timeline-sidebar"
      className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-stone-200 bg-white/[0.94]"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] px-5 pb-4 pt-3">
        <section className="border-b border-stone-200 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">本月日历</div>
              <h3 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-stone-900">{formatTimelineMonthTitle(visibleMonthDateKey)}</h3>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <button
                type="button"
                aria-label="上个月"
                onClick={() => setVisibleMonthDateKey((current) => shiftTimelineMonth(current, -1))}
                className="rounded-full px-1.5 py-0.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => {
                  setVisibleMonthDateKey(`${today.slice(0, 7)}-01`)
                  onSelectDate(today)
                }}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
              >
                今天
              </button>
              <button
                type="button"
                aria-label="下个月"
                onClick={() => setVisibleMonthDateKey((current) => shiftTimelineMonth(current, 1))}
                className="rounded-full px-1.5 py-0.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-stone-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div
            className="mt-2.5 grid grid-cols-7 gap-x-1.5"
            style={{ rowGap: compactMode ? '0.32rem' : '0.45rem' }}
            data-rows={monthRowCount}
          >
            {monthGrid.flat().map((cell) => (
              <button
                key={cell.dateKey}
                type="button"
                aria-label={`${formatDateKeyLabel(cell.dateKey)} · ${cell.count} 个块`}
                onClick={() => onSelectDate(cell.dateKey)}
                className="group relative flex min-w-0 items-center justify-center text-center"
                style={{ height: `${calendarCellHeight}px` }}
              >
                {cell.inCurrentMonth && (cell.count > 0 || cell.isSelected) ? (
                  <span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[11px]"
                    style={{
                      height: `${calendarFillHeight}px`,
                      width: `${calendarFillWidth}px`,
                      backgroundColor: cell.count > 0 ? MONTH_INTENSITY_COLORS[cell.intensityLevel] : 'rgba(255,255,255,0.72)',
                    }}
                  />
                ) : null}
                {cell.isSelected ? (
                  <span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[11px] border border-stone-900"
                    style={{ height: `${calendarFillHeight}px`, width: `${calendarFillWidth}px` }}
                  />
                ) : null}
                <span
                  className={`relative z-[1] flex h-full flex-col items-center justify-center leading-none ${
                    cell.inCurrentMonth ? 'text-stone-900' : 'text-stone-300'
                  } ${cell.isSelected ? 'font-semibold' : 'font-medium'}`}
                >
                  <span className={`text-[16px] ${cell.isToday ? 'underline decoration-stone-400/80 decoration-[1.5px] underline-offset-[2px]' : ''}`}>
                    {cell.dayOfMonth}
                  </span>
                  {cell.count > 0 ? (
                    <span className="mt-[1px] text-[9px] text-stone-500">{cell.count}</span>
                  ) : (
                    <span className="mt-[1px] h-[9px]" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="border-b border-stone-200 py-2">
          <div className="flex border-y border-stone-200">
            {SIDEBAR_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveMode(mode.id)}
                className={`min-w-[88px] border-r border-stone-200 px-3 py-2 text-sm font-medium transition ${
                  activeMode === mode.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                }`}
              >
                {mode.label}
              </button>
            ))}
            <div className="flex-1 bg-transparent" />
          </div>
        </section>

        <section className="min-h-0 overflow-hidden py-2">
          {activeMode === 'scheduled-todo' ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-hidden">
                {upcomingQuery.isPending ? (
                  <div className="py-3 text-sm text-stone-400">正在加载未来安排…</div>
                ) : visibleEntries.length > 0 ? (
                  <div className="divide-y divide-stone-200">
                    {visibleEntries.map((entry) => {
                      const acting = entryActionId === entry.id

                      return (
                        <div
                          key={entry.id}
                          className="flex w-full items-start justify-between gap-3 py-3 text-left first:pt-0"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenCalendarDate(entry.date)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-medium text-stone-900">{entry.title}</div>
                            <div className="mt-1 text-xs text-stone-500">{formatTodoMeta(entry)}</div>
                            {entry.notes ? <div className="mt-1 line-clamp-1 text-xs text-stone-400">{entry.notes}</div> : null}
                          </button>

                          <div
                            className="flex shrink-0 items-center gap-1"
                            onClick={(event) => {
                              event.stopPropagation()
                            }}
                          >
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() => {
                                void updateEntryStatus(entry.id, 'done')
                              }}
                              className="px-1 py-1 text-[11px] font-medium text-stone-600 transition hover:text-stone-900 disabled:opacity-50"
                            >
                              完成
                            </button>
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() => {
                                void updateEntryStatus(entry.id, 'canceled')
                              }}
                              className="px-1 py-1 text-[11px] font-medium text-stone-500 transition hover:text-stone-800 disabled:opacity-50"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {hiddenEntryCount > 0 ? (
                      <div className="pt-3 text-xs text-stone-400">还有 {hiddenEntryCount} 项安排，请前往日历查看。</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-3 text-sm leading-6 text-stone-500">还没有未来安排。先在日历里创建安排，之后这里会按时间顺序整理成 TODO。</div>
                )}
              </div>
            </div>
          ) : activeMode === 'review' ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="border-b border-stone-200 pb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">回顾工具</div>
              </div>
              <div className="divide-y divide-stone-200 pt-1">
                {REVIEW_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onOpenReview(mode.id, activeDateKey ?? today)}
                    className="w-full py-3 text-left text-sm text-stone-600 transition hover:text-stone-900"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  )
}
