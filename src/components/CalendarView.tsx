import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { CalendarEntry, CalendarSettings, CalendarSuggestion } from '../../shared/types'
import { useCalendarDayDetail, useCalendarHeatmap, useCalendarYears, useUpcomingCalendarEntries } from '../hooks/useCalendar'
import { buildCalendarHeatmapColumns, formatCalendarDateLabel, formatCalendarTimeLabel, groupUpcomingEntries } from '../lib/calendar'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { useToast } from './toast-context'

interface CalendarViewProps {
  settings: CalendarSettings
  onJumpToBlock: (blockId: string) => Promise<void>
}

interface CalendarEntryDraft {
  title: string
  date: string
  allDay: boolean
  startTime: string
  notes: string
}

type CalendarLayoutMode = 'three-pane' | 'two-pane' | 'stacked'
type CalendarDetailTab = 'entries' | 'suggestions' | 'blocks'
type CalendarSidebarTab = 'create' | 'upcoming'

const INTENSITY_CLASSES = [
  'bg-stone-100',
  'bg-emerald-100',
  'bg-emerald-200',
  'bg-emerald-400',
  'bg-emerald-700',
] as const

const THREE_PANE_BREAKPOINT = 1500
const STACKED_BREAKPOINT = 920
const SIDEBAR_TABS_BREAKPOINT = 1280

function resolveLayoutMode(width: number): CalendarLayoutMode {
  return width < STACKED_BREAKPOINT ? 'stacked' : width < THREE_PANE_BREAKPOINT ? 'two-pane' : 'three-pane'
}

function shouldUseSidebarTabs(width: number): boolean {
  return width < SIDEBAR_TABS_BREAKPOINT
}

function todayDateKey(): string {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function buildEntryDraft(date: string): CalendarEntryDraft {
  return {
    title: '',
    date,
    allDay: true,
    startTime: '',
    notes: '',
  }
}

function buildEntryPayload(draft: CalendarEntryDraft) {
  return {
    title: draft.title,
    date: draft.date,
    allDay: draft.allDay,
    startTime: draft.allDay ? null : draft.startTime || null,
    notes: draft.notes || null,
  }
}

function formatBlockTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function CalendarView({ settings, onJumpToBlock }: CalendarViewProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const heatmapContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const scrollResetFrameRef = useRef<number | null>(null)
  const viewportSizeRef = useRef({ width: 0, height: 0 })
  const today = todayDateKey()
  const currentYear = Number(today.slice(0, 4))
  const [activeYear, setActiveYear] = useState(currentYear)
  const [selectedDate, setSelectedDate] = useState(today)
  const [draft, setDraft] = useState<CalendarEntryDraft>(() => buildEntryDraft(today))
  const [creating, setCreating] = useState(false)
  const [heatmapCellSize, setHeatmapCellSize] = useState(16)
  const [heatmapGapSize, setHeatmapGapSize] = useState(4)
  const [showWeekLabels, setShowWeekLabels] = useState(true)
  const [layoutMode, setLayoutMode] = useState<CalendarLayoutMode>(() =>
    typeof window === 'undefined' ? 'three-pane' : resolveLayoutMode(window.innerWidth),
  )
  const [showSidebarTabs, setShowSidebarTabs] = useState(() =>
    typeof window === 'undefined' ? false : shouldUseSidebarTabs(window.innerWidth),
  )
  const [detailTab, setDetailTab] = useState<CalendarDetailTab>('entries')
  const [sidebarTab, setSidebarTab] = useState<CalendarSidebarTab>('create')
  const yearsQuery = useCalendarYears()
  const availableYears = useMemo(() => yearsQuery.data ?? [currentYear], [currentYear, yearsQuery.data])
  const heatmapQuery = useCalendarHeatmap(activeYear)
  const dayDetailQuery = useCalendarDayDetail(selectedDate)
  const upcomingQuery = useUpcomingCalendarEntries(settings.upcomingDays)
  const heatmap = heatmapQuery.data
  const dayDetail = dayDetailQuery.data
  const columns = useMemo(() => buildCalendarHeatmapColumns(heatmap?.days ?? []), [heatmap?.days])
  const groupedUpcoming = useMemo(() => groupUpcomingEntries(upcomingQuery.data ?? []), [upcomingQuery.data])

  const resetScrollPosition = useCallback((): void => {
    const scrollRoot = scrollRootRef.current

    if (!scrollRoot) {
      return
    }

    scrollRoot.scrollTo?.({ top: 0, behavior: 'auto' })
    scrollRoot.scrollTop = 0
  }, [])

  const scheduleScrollReset = useCallback((): void => {
    if (typeof window === 'undefined') {
      return
    }

    if (scrollResetFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollResetFrameRef.current)
    }

    scrollResetFrameRef.current = window.requestAnimationFrame(() => {
      scrollResetFrameRef.current = null
      resetScrollPosition()
    })
  }, [resetScrollPosition])

  useEffect(() => {
    if (availableYears.length === 0) {
      return
    }

    if (!availableYears.includes(activeYear)) {
      setActiveYear(availableYears[0])
    }
  }, [activeYear, availableYears])

  useEffect(() => {
    const selectedYear = Number(selectedDate.slice(0, 4))

    if (selectedYear !== activeYear) {
      const nextDate = activeYear === currentYear ? today : `${activeYear}-01-01`
      setSelectedDate(nextDate)
    }
  }, [activeYear, currentYear, selectedDate, today])

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      date: selectedDate,
    }))
  }, [selectedDate])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function syncViewport(): void {
      const width = window.innerWidth
      setLayoutMode(resolveLayoutMode(width))
      setShowSidebarTabs(shouldUseSidebarTabs(width))
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function resetCalendarViewport(): void {
      const width = window.innerWidth
      const height = window.innerHeight
      const previous = viewportSizeRef.current
      viewportSizeRef.current = { width, height }

      if (previous.width === 0 && previous.height === 0) {
        return
      }

      if (width === previous.width && height === previous.height) {
        return
      }

      resetScrollPosition()
      scheduleScrollReset()
    }

    resetCalendarViewport()
    window.addEventListener('resize', resetCalendarViewport)

    return () => {
      window.removeEventListener('resize', resetCalendarViewport)
    }
  }, [resetScrollPosition, scheduleScrollReset])

  useLayoutEffect(() => {
    scheduleScrollReset()
  }, [layoutMode, scheduleScrollReset, showSidebarTabs])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && scrollResetFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollResetFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const container = heatmapContainerRef.current

    if (!container || columns.length === 0) {
      return
    }

    function syncHeatmapLayout(width: number): void {
      const maxCellSize = width >= 1400 ? 16 : width >= 1080 ? 15 : 14
      const preferredGap = width >= 1280 ? 4 : width >= 960 ? 3 : width >= 640 ? 2 : width >= 440 ? 1 : 0
      const hardMinCellSize = width >= 760 ? 6 : width >= 560 ? 4 : width >= 420 ? 3 : 2

      const computeMetrics = (withWeekLabels: boolean) => {
        const weekLabelWidth = withWeekLabels ? 28 : 0
        const sectionGap = withWeekLabels ? 12 : 0
        const availableGridWidth = Math.max(96, width - weekLabelWidth - sectionGap)
        const gap = preferredGap
        const exactCellSize = (availableGridWidth - gap * Math.max(columns.length - 1, 0)) / Math.max(columns.length, 1)

        return {
          cellSize: Math.min(maxCellSize, Math.max(hardMinCellSize, exactCellSize)),
          gapSize: gap,
        }
      }

      let nextShowWeekLabels = width >= 920
      let metrics = computeMetrics(nextShowWeekLabels)

      if (nextShowWeekLabels && metrics.cellSize <= hardMinCellSize + 0.5) {
        nextShowWeekLabels = false
        metrics = computeMetrics(false)
      }

      setShowWeekLabels(nextShowWeekLabels)
      setHeatmapCellSize(metrics.cellSize)
      setHeatmapGapSize(metrics.gapSize)
    }

    syncHeatmapLayout(container.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      syncHeatmapLayout(entry.contentRect.width)
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [columns.length, layoutMode])

  async function refreshCalendar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
  }

  async function handleCreateEntry(): Promise<void> {
    setCreating(true)

    try {
      await changbu.calendar.createEntry(buildEntryPayload(draft))
      await refreshCalendar()
      setDraft(buildEntryDraft(selectedDate))
      setDetailTab('entries')
      setSidebarTab('create')
      toast('success', '日历安排已创建。')
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '创建安排失败。')
    } finally {
      setCreating(false)
    }
  }

  const heatmapStyles = useMemo(
    () =>
      ({
        '--calendar-cell-size': `${heatmapCellSize}px`,
        '--calendar-cell-gap': `${heatmapGapSize}px`,
      }) as CSSProperties,
    [heatmapCellSize, heatmapGapSize],
  )



  const detailSections: Array<{
    key: CalendarDetailTab
    label: string
    title: string
    count: number
    emptyText: string
  }> = [
    {
      key: 'entries',
      label: '安排',
      title: '当天安排',
      count: dayDetail?.entries.length ?? 0,
      emptyText: '这一天还没有正式安排。可以在右侧手动添加，或把 AI 建议采纳进来。',
    },
    {
      key: 'suggestions',
      label: 'AI 建议',
      title: '待确认建议',
      count: dayDetail?.suggestions.length ?? 0,
      emptyText: '当前没有待确认的日期建议。含有明确日期的块在 enrich 完成后会出现在这里。',
    },
    {
      key: 'blocks',
      label: '当天块',
      title: '当天写下的块',
      count: dayDetail?.blocks.length ?? 0,
      emptyText: '这一天没有写入块。',
    },
  ]

  const activeDetailSection = detailSections.find((section) => section.key === detailTab) ?? detailSections[0]

  let detailContent: ReactNode

  if (dayDetailQuery.isPending) {
    detailContent = <p className="text-sm text-stone-400">正在加载当天详情…</p>
  } else if (detailTab === 'entries') {
    detailContent = dayDetail && dayDetail.entries.length > 0 ? (
      <div className="space-y-3">
        {dayDetail.entries.map((entry) => (
          <EditableEntryCard key={entry.id} entry={entry} onSaved={refreshCalendar} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-400">{activeDetailSection.emptyText}</p>
    )
  } else if (detailTab === 'suggestions') {
    detailContent = dayDetail && dayDetail.suggestions.length > 0 ? (
      <div className="space-y-3">
        {dayDetail.suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onUpdated={refreshCalendar} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-400">{activeDetailSection.emptyText}</p>
    )
  } else {
    detailContent = dayDetail && dayDetail.blocks.length > 0 ? (
      <div className="space-y-3">
        {dayDetail.blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => {
              void onJumpToBlock(block.id)
            }}
            className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{formatBlockTime(block.createdAt)}</span>
              <span className="min-w-0 truncate text-xs text-stone-400">{block.tags.slice(0, 3).map((tag) => tag.name).join(' · ')}</span>
            </div>
            <div className="mt-2 break-words text-sm font-medium leading-6 text-stone-900">{block.summary || block.content.slice(0, 120)}</div>
            <div className="mt-2 line-clamp-2 break-words text-sm leading-6 text-stone-500">{block.content}</div>
          </button>
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-400">{activeDetailSection.emptyText}</p>
    )
  }

  const createSection = (
    <section className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">New Entry</p>
        <h4 className="mt-2 break-words text-lg font-semibold text-stone-900">为 {selectedDate} 添加安排</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">默认围绕当前选中日期创建，也可以在提交前改到别的日期。</p>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-stone-400">标题</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="例如：和设计师过一遍首屏"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-stone-400">日期</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
            className="h-4 w-4 rounded border-stone-300"
          />
          全天安排
        </label>
        {!draft.allDay ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-stone-400">开始时间</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
            />
          </label>
        ) : null}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-stone-400">备注</span>
          <textarea
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            rows={3}
            placeholder="可选，补充上下文。"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void handleCreateEntry()
          }}
          disabled={creating}
          className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {creating ? '创建中…' : '创建安排'}
        </button>
      </div>
    </section>
  )

  const upcomingSection = (
    <section className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Upcoming</p>
        <h4 className="mt-2 text-lg font-semibold text-stone-900">未来 {settings.upcomingDays} 天</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">缩小时这里会优先收进切换区，避免右侧长列表持续挤压主区。</p>
      </div>
      <div className="mt-4 space-y-4">
        {upcomingQuery.isPending ? (
          <p className="text-sm text-stone-400">正在加载未来安排…</p>
        ) : groupedUpcoming.length > 0 ? (
          groupedUpcoming.map((group) => (
            <div key={group.date}>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{formatCalendarDateLabel(group.date)}</div>
              <div className="space-y-2">
                {group.items.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedDate(entry.date)
                      setDetailTab('entries')
                    }}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left transition hover:border-stone-300 hover:bg-stone-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-medium text-stone-900">{entry.title}</span>
                      <span className="shrink-0 text-xs text-stone-400">{formatCalendarTimeLabel(entry.startTime)}</span>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {entry.status === 'planned' ? '待办' : entry.status === 'done' ? '已完成' : '已取消'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-400">未来几天还没有安排。</p>
        )}
      </div>
    </section>
  )

  const heatmapPanel = (
    <section className="min-w-0 shrink-0 overflow-hidden rounded-[28px] border border-stone-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(68,48,22,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200/80 pb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">{activeYear} 年记录密度</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {availableYears.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setActiveYear(year)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                year === activeYear ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {heatmapQuery.isPending ? (
        <div className="mt-5 flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 text-sm text-stone-400">
          正在加载年度热力图…
        </div>
      ) : columns.length > 0 ? (
        <div ref={heatmapContainerRef} className="mt-5 min-w-0 overflow-hidden" style={heatmapStyles}>
          <div className="flex min-w-0 items-start gap-3">
            {showWeekLabels ? (
              <div className="flex shrink-0 flex-col pt-8 text-[11px] text-stone-500">
                {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, index) => (
                  <div
                    key={`${label}-${index}`}
                    className="flex items-center pr-2 leading-none"
                    style={{ height: `${heatmapCellSize}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex" style={{ gap: `${heatmapGapSize}px` }}>
                {columns.map((column) => (
                  <div
                    key={`${column.key}-label`}
                    className="overflow-hidden text-[11px] leading-none text-stone-400"
                    style={{ width: `${heatmapCellSize}px` }}
                  >
                    {column.monthLabel}
                  </div>
                ))}
              </div>

              <div className="flex" style={{ gap: `${heatmapGapSize}px` }}>
                {columns.map((column) => (
                  <div key={column.key} className="flex flex-col" style={{ gap: `${heatmapGapSize}px` }}>
                    {column.days.map((day, index) => {
                      if (!day) {
                        return (
                          <div
                            key={`${column.key}-empty-${index}`}
                            className="rounded-[4px] bg-transparent"
                            style={{ height: `${heatmapCellSize}px`, width: `${heatmapCellSize}px` }}
                          />
                        )
                      }

                      const selected = day.date === selectedDate
                      const dayLabel = `${formatCalendarDateLabel(day.date)} · ${day.blockCount} 个块`

                      return (
                        <button
                          key={day.date}
                          type="button"
                          title={dayLabel}
                          aria-label={dayLabel}
                          onClick={() => setSelectedDate(day.date)}
                          className={`relative rounded-[4px] transition ${INTENSITY_CLASSES[day.intensityLevel]} ${
                            selected ? 'ring-2 ring-stone-900 ring-offset-1 ring-offset-white' : ''
                          } ${day.hasEntries ? 'border border-stone-400/60' : 'border border-black/5'}`}
                          style={{ height: `${heatmapCellSize}px`, width: `${heatmapCellSize}px` }}
                        >
                          {day.hasSuggestions ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-5 text-sm leading-6 text-stone-500">
          当前年份还没有可展示的日历记录。
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-stone-500 sm:justify-end">
        <span>Less</span>
        {INTENSITY_CLASSES.map((className) => (
          <span key={className} className={`h-4 w-4 rounded-[4px] border border-black/5 ${className}`} />
        ))}
        <span>More</span>
      </div>


    </section>
  )

  const detailPanel = (
    <section className="min-w-0 shrink-0 rounded-[28px] border border-stone-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(68,48,22,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Day Detail</p>
          <h3 className="mt-2 break-words text-2xl font-semibold text-stone-900">{formatCalendarDateLabel(selectedDate)}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-500">当天详情只保留一个主内容区，切换时不再让安排、建议、块三段一起向下拉长页面。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">{activeDetailSection.count} 项</span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-500">当前面板：{activeDetailSection.label}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {detailSections.map((section) => {
          const active = section.key === detailTab

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setDetailTab(section.key)}
              aria-pressed={active}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {section.label}
              <span className={`ml-2 text-xs ${active ? 'text-white/70' : 'text-stone-400'}`}>{section.count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Current Panel</p>
            <h4 className="mt-1 break-words text-xl font-semibold text-stone-900">{activeDetailSection.title}</h4>
          </div>
        </div>
        {detailContent}
      </div>
    </section>
  )

  const contextPanel = (
    <aside className="min-w-0 shrink-0 rounded-[28px] border border-stone-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(68,48,22,0.06)]">
      <div className="flex flex-col gap-3 border-b border-stone-200/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Context</p>
          <h3 className="mt-2 text-xl font-semibold text-stone-900">侧边上下文</h3>
          <p className="mt-2 text-sm leading-6 text-stone-500">默认承载新建安排与未来安排；窗口缩小时先压缩这里，而不是继续压热力图主区。</p>
        </div>
        {showSidebarTabs ? (
          <div className="flex flex-wrap gap-2" data-testid="calendar-sidebar-tablist">
            <button
              type="button"
              onClick={() => setSidebarTab('create')}
              aria-pressed={sidebarTab === 'create'}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                sidebarTab === 'create' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
            >
              新建安排
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('upcoming')}
              aria-pressed={sidebarTab === 'upcoming'}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                sidebarTab === 'upcoming' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
            >
              未来安排
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {showSidebarTabs ? (sidebarTab === 'create' ? createSection : upcomingSection) : (
          <>
            {createSection}
            {upcomingSection}
          </>
        )}
      </div>
    </aside>
  )

  return (
    <section
      ref={(node) => {
        scrollRootRef.current = node
      }}
      data-testid="calendar-scroll-root"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1"
      style={{ overflowAnchor: 'none' }}
    >
      {layoutMode === 'three-pane' ? (
        <div
          data-testid="calendar-layout"
          data-layout={layoutMode}
          data-sidebar-mode={showSidebarTabs ? 'tabs' : 'stacked'}
          className="grid min-h-0 min-w-0 shrink-0 gap-4 grid-cols-[minmax(0,1.25fr)_minmax(20rem,24rem)_minmax(18rem,20rem)]"
        >
          {heatmapPanel}
          {detailPanel}
          {contextPanel}
        </div>
      ) : layoutMode === 'two-pane' ? (
        <div
          data-testid="calendar-layout"
          data-layout={layoutMode}
          data-sidebar-mode={showSidebarTabs ? 'tabs' : 'stacked'}
          className="grid min-h-0 min-w-0 shrink-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]"
        >
          <div className="min-w-0 shrink-0 space-y-4">
            {heatmapPanel}
            {detailPanel}
          </div>
          {contextPanel}
        </div>
      ) : (
        <div
          data-testid="calendar-layout"
          data-layout={layoutMode}
          data-sidebar-mode={showSidebarTabs ? 'tabs' : 'stacked'}
          className="flex min-h-0 min-w-0 shrink-0 flex-col gap-4"
        >
          {heatmapPanel}
          {detailPanel}
          {contextPanel}
        </div>
      )}
    </section>
  )
}

function EditableEntryCard({
  entry,
  onSaved,
}: {
  entry: CalendarEntry
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<CalendarEntryDraft>({
    title: entry.title,
    date: entry.date,
    allDay: entry.allDay,
    startTime: entry.startTime ?? '',
    notes: entry.notes ?? '',
  })
  const [status, setStatus] = useState(entry.status)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    setDraft({
      title: entry.title,
      date: entry.date,
      allDay: entry.allDay,
      startTime: entry.startTime ?? '',
      notes: entry.notes ?? '',
    })
    setStatus(entry.status)
  }, [entry])

  async function handleSave(): Promise<void> {
    setSaving(true)

    try {
      await changbu.calendar.updateEntry(entry.id, {
        ...buildEntryPayload(draft),
        status,
      })
      await onSaved()
      toast('success', '安排已更新。')
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '更新安排失败。')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(): Promise<void> {
    setRemoving(true)

    try {
      await changbu.calendar.removeEntry(entry.id)
      await onSaved()
      toast('success', '安排已删除。')
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '删除安排失败。')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
      <div className="grid gap-3">
        <input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_130px_120px]">
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
          />
          <input
            type="time"
            value={draft.startTime}
            disabled={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 disabled:bg-stone-100"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CalendarEntry['status'])}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
          >
            <option value="planned">待办</option>
            <option value="done">已完成</option>
            <option value="canceled">已取消</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
            className="h-4 w-4 rounded border-stone-300"
          />
          全天
        </label>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          placeholder="备注"
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <span className="text-xs text-stone-400">{entry.source === 'manual' ? '手动创建' : 'AI 建议已采纳'}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSave()
              }}
              disabled={saving}
              className="rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRemove()
              }}
              disabled={removing}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {removing ? '删除中…' : '删除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SuggestionCard({
  suggestion,
  onUpdated,
}: {
  suggestion: CalendarSuggestion
  onUpdated: () => Promise<void>
}) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<CalendarEntryDraft>({
    title: suggestion.title,
    date: suggestion.date,
    allDay: suggestion.allDay,
    startTime: suggestion.startTime ?? '',
    notes: suggestion.notes ?? '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft({
      title: suggestion.title,
      date: suggestion.date,
      allDay: suggestion.allDay,
      startTime: suggestion.startTime ?? '',
      notes: suggestion.notes ?? '',
    })
  }, [suggestion])

  async function handleAccept(): Promise<void> {
    setBusy(true)

    try {
      await changbu.calendar.acceptSuggestion(suggestion.id, buildEntryPayload(draft))
      await onUpdated()
      toast('success', 'AI 建议已采纳。')
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '采纳建议失败。')
    } finally {
      setBusy(false)
    }
  }

  async function handleDismiss(): Promise<void> {
    setBusy(true)

    try {
      await changbu.calendar.dismissSuggestion(suggestion.id)
      await onUpdated()
      toast('success', 'AI 建议已忽略。')
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '忽略建议失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">来自块 {suggestion.sourceBlockId.slice(0, 8)}</span>
        <span className="text-xs text-amber-700">置信度 {Math.round(suggestion.confidence * 100)}%</span>
      </div>
      <div className="grid gap-3">
        <input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_130px]">
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400"
          />
          <input
            type="time"
            value={draft.startTime}
            disabled={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 disabled:bg-amber-100/60"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-amber-800">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
            className="h-4 w-4 rounded border-amber-300"
          />
          全天安排
        </label>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          placeholder="备注"
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400"
        />
        {suggestion.evidenceText ? <p className="text-xs leading-5 text-amber-800">证据：{suggestion.evidenceText}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void handleAccept()
            }}
            disabled={busy}
            className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? '处理中…' : '采纳为正式安排'}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDismiss()
            }}
            disabled={busy}
            className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100/60 disabled:opacity-50"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  )
}
