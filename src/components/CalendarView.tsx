import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { CalendarEntry, CalendarSettings, CalendarSuggestion } from '../../shared/types'
import { useCalendarDayDetail, useCalendarHeatmap, useCalendarYears, useUpcomingCalendarEntries } from '../hooks/useCalendar'
import { buildCalendarHeatmapColumns, formatCalendarDateLabel, formatCalendarTimeLabel, groupUpcomingEntries } from '../lib/calendar'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { SectionEyebrow } from './ui/SectionEyebrow'
import { useToast } from './toast-context'

interface CalendarViewProps {
  settings: CalendarSettings
  onJumpToBlock: (blockId: string) => Promise<void>
  selectedDateOverride?: string | null
  onSelectedDateOverrideHandled?: () => void
}

interface CalendarEntryDraft {
  title: string
  date: string
  allDay: boolean
  startTime: string
  notes: string
}

type CalendarLayoutMode = 'two-pane' | 'single-pane'
type CalendarDetailTab = 'entries' | 'suggestions' | 'blocks'
type CalendarSidebarTab = 'create' | 'upcoming'

const INTENSITY_CLASSES = [
  'bg-stone-100',
  'bg-emerald-100',
  'bg-emerald-200',
  'bg-emerald-400',
  'bg-emerald-700',
] as const

function clampIndicatorSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const SIDEBAR_COLLAPSE_BREAKPOINT = 1120
const INLINE_SIDEBAR_TAB_BREAKPOINT = 760
const HEATMAP_FOCUSED_WINDOW_BREAKPOINT = 680

type HeatmapDisplayMode = 'full-year' | 'focused-window'

function resolveLayoutMode(width: number): CalendarLayoutMode {
  return width < SIDEBAR_COLLAPSE_BREAKPOINT ? 'single-pane' : 'two-pane'
}

function shouldUseSidebarTabs(width: number): boolean {
  return width < INLINE_SIDEBAR_TAB_BREAKPOINT
}

function todayDateKey(): string {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function getColumnAnchorDate(column: ReturnType<typeof buildCalendarHeatmapColumns>[number]): string | null {
  return column.days.find((day) => day)?.date ?? null
}

function getColumnMonthFallbackLabel(column: ReturnType<typeof buildCalendarHeatmapColumns>[number]): string | null {
  const anchorDate = getColumnAnchorDate(column)

  if (!anchorDate) {
    return null
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(`${anchorDate}T00:00:00`))
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

export function CalendarView({
  settings,
  onJumpToBlock,
  selectedDateOverride,
  onSelectedDateOverrideHandled,
}: CalendarViewProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const heatmapContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const scrollResetFrameRef = useRef<number | null>(null)
  const viewportSizeRef = useRef({ width: 0, height: 0 })
  const previousLayoutModeRef = useRef<CalendarLayoutMode | null>(null)
  const today = todayDateKey()
  const currentYear = Number(today.slice(0, 4))
  const [activeYear, setActiveYear] = useState(currentYear)
  const [selectedDate, setSelectedDate] = useState(today)
  const [draft, setDraft] = useState<CalendarEntryDraft>(() => buildEntryDraft(today))
  const [creating, setCreating] = useState(false)
  const [heatmapCellSize, setHeatmapCellSize] = useState(16)
  const [heatmapGapSize, setHeatmapGapSize] = useState(4)
  const [showWeekLabels, setShowWeekLabels] = useState(true)
  const [heatmapDisplayMode, setHeatmapDisplayMode] = useState<HeatmapDisplayMode>('full-year')
  const [heatmapVisibleColumnCount, setHeatmapVisibleColumnCount] = useState<number | null>(null)
  const [layoutMode, setLayoutMode] = useState<CalendarLayoutMode>(() =>
    typeof window === 'undefined' ? 'two-pane' : resolveLayoutMode(window.innerWidth),
  )
  const [showSidebarTabs, setShowSidebarTabs] = useState(() =>
    typeof window === 'undefined' ? false : shouldUseSidebarTabs(window.innerWidth),
  )
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : resolveLayoutMode(window.innerWidth) === 'two-pane',
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
  const visibleHeatmapColumns = useMemo(() => {
    if (columns.length === 0 || heatmapDisplayMode === 'full-year' || !heatmapVisibleColumnCount || heatmapVisibleColumnCount >= columns.length) {
      return columns
    }

    const fallbackDate = activeYear === currentYear ? today : columns.find((column) => column.days.some((day) => day !== null))?.days.find((day) => day)?.date ?? null
    const focusDate = columns.some((column) => column.days.some((day) => day?.date === selectedDate))
      ? selectedDate
      : fallbackDate

    const focusIndex = focusDate
      ? columns.findIndex((column) => column.days.some((day) => day?.date === focusDate))
      : -1
    const safeIndex = focusIndex >= 0 ? focusIndex : Math.floor(columns.length / 2)
    const windowSize = Math.min(columns.length, heatmapVisibleColumnCount)

    let start = Math.max(0, safeIndex - Math.floor(windowSize / 2))
    let end = start + windowSize

    if (end > columns.length) {
      end = columns.length
      start = Math.max(0, end - windowSize)
    }

    return columns.slice(start, end).map((column, index) => (
      index === 0 && !column.monthLabel
        ? {
            ...column,
            monthLabel: getColumnMonthFallbackLabel(column),
          }
        : column
    ))
  }, [activeYear, columns, currentYear, heatmapDisplayMode, heatmapVisibleColumnCount, selectedDate, today])
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
    if (!selectedDateOverride) {
      return
    }

    setSelectedDate(selectedDateOverride)
    setActiveYear(Number(selectedDateOverride.slice(0, 4)))
    setDetailTab('entries')
    onSelectedDateOverrideHandled?.()
  }, [onSelectedDateOverrideHandled, selectedDateOverride])

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
    const previousLayout = previousLayoutModeRef.current
    previousLayoutModeRef.current = layoutMode

    if (layoutMode === 'two-pane') {
      setSidebarOpen(true)
      return
    }

    if (previousLayout === 'two-pane') {
      setSidebarOpen(false)
      setSidebarTab('create')
    }
  }, [layoutMode])

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
  }, [layoutMode, scheduleScrollReset, showSidebarTabs, sidebarOpen])

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

      const computeMetrics = (withWeekLabels: boolean, columnCount: number) => {
        const weekLabelWidth = withWeekLabels ? 28 : 0
        const sectionGap = withWeekLabels ? 12 : 0
        const availableGridWidth = Math.max(96, width - weekLabelWidth - sectionGap)
        const gap = preferredGap
        const exactCellSize = (availableGridWidth - gap * Math.max(columnCount - 1, 0)) / Math.max(columnCount, 1)

        return {
          cellSize: Math.min(maxCellSize, Math.max(hardMinCellSize, exactCellSize)),
          gapSize: gap,
          availableGridWidth,
        }
      }

      let nextShowWeekLabels = width >= 920
      let metrics = computeMetrics(nextShowWeekLabels, columns.length)

      if (nextShowWeekLabels && metrics.cellSize <= hardMinCellSize + 0.5) {
        nextShowWeekLabels = false
        metrics = computeMetrics(false, columns.length)
      }

      const fullYearCellSize = metrics.cellSize
      const shouldUseFocusedWindow = width < HEATMAP_FOCUSED_WINDOW_BREAKPOINT || fullYearCellSize < 7
      let nextVisibleColumnCount: number | null = null

      if (shouldUseFocusedWindow) {
        const focusedCellSize = 14
        const focusedGap = width >= 420 ? 2 : 1
        nextShowWeekLabels = width >= 240

        const computeFocusedCount = (withWeekLabels: boolean) => {
          const weekLabelWidth = withWeekLabels ? 28 : 0
          const sectionGap = withWeekLabels ? 12 : 0
          const availableGridWidth = Math.max(96, width - weekLabelWidth - sectionGap)

          return Math.max(1, Math.min(
            columns.length,
            Math.floor((availableGridWidth + focusedGap) / Math.max(focusedCellSize + focusedGap, 1)),
          ))
        }

        nextVisibleColumnCount = computeFocusedCount(nextShowWeekLabels)

        if (nextShowWeekLabels && nextVisibleColumnCount <= 8) {
          nextShowWeekLabels = false
          nextVisibleColumnCount = computeFocusedCount(false)
        }

        metrics = {
          cellSize: focusedCellSize,
          gapSize: focusedGap,
          availableGridWidth: Math.max(
            96,
            width - (nextShowWeekLabels ? 28 : 0) - (nextShowWeekLabels ? 12 : 0),
          ),
        }
      }

      setShowWeekLabels(nextShowWeekLabels)
      setHeatmapCellSize(metrics.cellSize)
      setHeatmapGapSize(metrics.gapSize)
      setHeatmapDisplayMode(shouldUseFocusedWindow ? 'focused-window' : 'full-year')
      setHeatmapVisibleColumnCount(nextVisibleColumnCount)
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
  }, [columns, layoutMode, sidebarOpen])

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
  const heatmapEntryIndicatorStyle = useMemo(
    () => ({
      width: `${clampIndicatorSize(Math.round(heatmapCellSize * 0.62), 3, 10)}px`,
      height: `${clampIndicatorSize(Math.round(heatmapCellSize * 0.18), 2, 3)}px`,
    }),
    [heatmapCellSize],
  )
  const heatmapSuggestionIndicatorStyle = useMemo(() => {
    const size = clampIndicatorSize(Math.round(heatmapCellSize * 0.34), 3, 6)

    return {
      height: `${size}px`,
      width: `${size}px`,
    }
  }, [heatmapCellSize])
  const showHeatmapEntryIndicator = heatmapCellSize >= 8
  const showHeatmapSuggestionIndicator = heatmapCellSize >= 7

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
      emptyText: '这一天还没有正式安排。可以在侧边栏手动添加，或把 AI 建议采纳进来。',
    },
    {
      key: 'suggestions',
      label: 'AI 建议',
      title: settings.autoAcceptAiSuggestions ? 'AI 建议（自动加入已开启）' : '待确认建议',
      count: dayDetail?.suggestions.length ?? 0,
      emptyText: settings.autoAcceptAiSuggestions
        ? '已开启自动加入日历。新识别到的明确安排会直接进入“安排”，这里只会保留尚未被自动处理的旧建议。'
        : '当前没有待确认的日期建议。含有明确日期的块在 enrich 完成后会出现在这里。',
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
      <div className="divide-y divide-stone-200">
        {dayDetail.entries.map((entry) => (
          <EditableEntryCard key={entry.id} entry={entry} onSaved={refreshCalendar} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  } else if (detailTab === 'suggestions') {
    detailContent = dayDetail && dayDetail.suggestions.length > 0 ? (
      <div className="divide-y divide-stone-200">
        {dayDetail.suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onUpdated={refreshCalendar} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  } else {
    detailContent = dayDetail && dayDetail.blocks.length > 0 ? (
      <div className="divide-y divide-stone-200">
        {dayDetail.blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => {
              void onJumpToBlock(block.id)
            }}
            className="flex w-full flex-col gap-2 py-4 text-left transition first:pt-0 hover:text-stone-950"
          >
            <div className="flex items-center justify-between gap-3 text-xs text-stone-400">
              <span className="font-medium uppercase tracking-[0.18em]">{formatBlockTime(block.createdAt)}</span>
              <span className="min-w-0 truncate">{block.tags.slice(0, 3).map((tag) => tag.name).join(' · ')}</span>
            </div>
            <div className="break-words text-sm font-medium leading-6 text-stone-900">{block.summary || block.content.slice(0, 120)}</div>
            <div className="line-clamp-2 break-words text-sm leading-6 text-stone-500">{block.content}</div>
          </button>
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  }

  const createSection = (
    <section>
      <div className="min-w-0">
        <SectionEyebrow>New Entry</SectionEyebrow>
        <h4 className="mt-3 break-words text-lg font-semibold text-stone-900">为 {selectedDate} 添加安排</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">默认围绕当前选中日期创建，也可以在提交前改到别的日期。</p>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">标题</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="例如：和设计师过一遍首屏"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">日期</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
            className="h-4 w-4 rounded border-stone-300"
          />
          全天安排
        </label>
        {!draft.allDay ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-500">开始时间</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">备注</span>
          <textarea
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            rows={3}
            placeholder="可选，补充上下文。"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void handleCreateEntry()
          }}
          disabled={creating}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {creating ? '创建中…' : '创建安排'}
        </button>
      </div>
    </section>
  )

  const upcomingSection = (
    <section>
      <div className="min-w-0">
        <SectionEyebrow>Upcoming</SectionEyebrow>
        <h4 className="mt-3 text-lg font-semibold text-stone-900">未来 {settings.upcomingDays} 天</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">保留未来安排概览，方便从日视图直接切过去处理。</p>
      </div>
      <div className="mt-5 space-y-5">
        {upcomingQuery.isPending ? (
          <p className="text-sm text-stone-400">正在加载未来安排…</p>
        ) : groupedUpcoming.length > 0 ? (
          groupedUpcoming.map((group) => (
            <div key={group.date}>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{formatCalendarDateLabel(group.date)}</div>
              <div className="divide-y divide-stone-200">
                {group.items.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedDate(entry.date)
                      setDetailTab('entries')
                    }}
                    className="flex w-full items-start justify-between gap-3 py-3 text-left first:pt-0 hover:text-stone-950"
                  >
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium text-stone-900">{entry.title}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {entry.status === 'planned' ? '待办' : entry.status === 'done' ? '已完成' : '已取消'}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">{formatCalendarTimeLabel(entry.startTime)}</span>
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

  const renderSidebarContent = (compact = false) => (
    <div className={compact ? '' : 'space-y-8'}>
      {compact ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">侧边栏</p>
              <h3 className="mt-1 text-base font-semibold text-stone-900">安排与未来</h3>
            </div>
            <div className="flex items-center gap-4 text-sm" data-testid="calendar-sidebar-tablist">
              <button
                type="button"
                onClick={() => setSidebarTab('create')}
                aria-pressed={sidebarTab === 'create'}
                className={`border-b pb-1 transition ${sidebarTab === 'create' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
              >
                新建安排
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('upcoming')}
                aria-pressed={sidebarTab === 'upcoming'}
                className={`border-b pb-1 transition ${sidebarTab === 'upcoming' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
              >
                未来安排
              </button>
            </div>
          </div>
          <div className="mt-6 border-t border-stone-200 pt-6">
            {sidebarTab === 'create' ? createSection : upcomingSection}
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">侧边栏</p>
            <h3 className="mt-1 text-base font-semibold text-stone-900">安排与未来</h3>
          </div>
          <div className="border-t border-stone-200 pt-6">{createSection}</div>
          <div className="border-t border-stone-200 pt-6">{upcomingSection}</div>
        </>
      )}
    </div>
  )

  const heatmapSection = (
    <section className="min-w-0 shrink-0 border-b border-stone-200 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">全年热力图</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {availableYears.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setActiveYear(year)}
              className={`border-b pb-1 transition ${year === activeYear ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {heatmapQuery.isPending ? (
        <div className="mt-4 py-10 text-sm text-stone-400">正在加载年度热力图…</div>
      ) : visibleHeatmapColumns.length > 0 ? (
        <div
          ref={heatmapContainerRef}
          data-testid="calendar-heatmap"
          data-mode={heatmapDisplayMode}
          className="mt-4 min-w-0 overflow-hidden"
          style={heatmapStyles}
        >
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
                {visibleHeatmapColumns.map((column) => (
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
                {visibleHeatmapColumns.map((column) => (
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
                          data-selected={selected ? 'true' : 'false'}
                          data-has-entries={day.hasEntries ? 'true' : 'false'}
                          data-has-suggestions={day.hasSuggestions ? 'true' : 'false'}
                          onClick={() => setSelectedDate(day.date)}
                          className={`relative isolate rounded-[4px] border transition ${
                            INTENSITY_CLASSES[day.intensityLevel]
                          } ${selected
                            ? 'z-10 border-stone-900/75'
                            : day.hasEntries
                              ? 'border-stone-700/70'
                              : day.hasSuggestions
                                ? 'border-amber-400/75'
                                : 'border-black/5'}`}
                          style={{
                            height: `${heatmapCellSize}px`,
                            width: `${heatmapCellSize}px`,
                            boxShadow: selected ? 'inset 0 0 0 2px #1c1917' : undefined,
                          }}
                        >
                          {day.hasEntries && showHeatmapEntryIndicator ? (
                            <span
                              aria-hidden="true"
                              data-testid={`calendar-entry-indicator-${day.date}`}
                              className="pointer-events-none absolute bottom-[2px] left-1/2 -translate-x-1/2 rounded-full bg-stone-900/85"
                              style={heatmapEntryIndicatorStyle}
                            />
                          ) : null}
                          {day.hasSuggestions && showHeatmapSuggestionIndicator ? (
                            <span
                              aria-hidden="true"
                              data-testid={`calendar-suggestion-indicator-${day.date}`}
                              className="pointer-events-none absolute right-[1px] top-[1px] rounded-full border border-white/85 bg-amber-500 shadow-[0_0_0_1px_rgba(120,53,15,0.12)]"
                              style={heatmapSuggestionIndicatorStyle}
                            />
                          ) : null}
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
        <div className="mt-6 py-10 text-sm leading-6 text-stone-500">当前年份还没有可展示的日历记录。</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
        {heatmapDisplayMode === 'focused-window' ? (
          <div className="flex items-center gap-2 text-stone-400">
            <span className="rounded-full border border-stone-200 px-2.5 py-1">已聚焦当前日期附近</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span>密度</span>
          <span>Less</span>
          {INTENSITY_CLASSES.map((className) => (
            <span key={className} className={`h-4 w-4 rounded-[4px] border border-black/5 ${className}`} />
          ))}
          <span>More</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative block h-4 w-4 rounded-[4px] border border-stone-700/70 bg-stone-100">
            <span className="absolute bottom-[2px] left-1/2 h-[2px] w-[8px] -translate-x-1/2 rounded-full bg-stone-900/85" />
          </span>
          <span>已有安排</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative block h-4 w-4 rounded-[4px] border border-black/5 bg-stone-100">
            <span className="absolute right-[1px] top-[1px] h-[5px] w-[5px] rounded-full border border-white/85 bg-amber-500" />
          </span>
          <span>AI 建议</span>
        </div>
      </div>
    </section>
  )

  const detailSection = (
    <section className="min-w-0 shrink-0 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">当天详情</p>
          <h3 className="mt-2 break-words text-2xl font-semibold text-stone-900">{formatCalendarDateLabel(selectedDate)}</h3>
        </div>
        <p className="text-sm text-stone-400">当前 {activeDetailSection.title} · {activeDetailSection.count} 项</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 border-b border-stone-200 pb-3 text-sm">
        {detailSections.map((section) => {
          const active = section.key === detailTab

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setDetailTab(section.key)}
              aria-pressed={active}
              className={`border-b pb-1 transition ${active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
            >
              {section.label}
              <span className="ml-2 text-xs text-stone-400">{section.count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 min-w-0">{detailContent}</div>
    </section>
  )

  return (
    <section
      ref={(node) => {
        scrollRootRef.current = node
      }}
      data-testid="calendar-scroll-root"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-2"
      style={{ overflowAnchor: 'none' }}
    >
      <div
        data-testid="calendar-layout"
        data-layout={layoutMode}
        data-sidebar-mode={layoutMode === 'two-pane' ? 'docked' : sidebarOpen ? 'inline' : 'collapsed'}
        className={layoutMode === 'two-pane'
          ? 'grid min-h-0 min-w-0 shrink-0 gap-10 xl:grid-cols-[minmax(0,1fr)_17.5rem] 2xl:grid-cols-[minmax(0,1fr)_19rem]'
          : 'min-h-0 min-w-0 shrink-0'}
      >
        <div className="min-w-0 shrink-0">
          {layoutMode === 'single-pane' ? (
            <div className="mb-5 flex items-center justify-between border-b border-stone-200 pb-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">侧边栏</p>
              </div>
              <button
                type="button"
                data-testid="calendar-sidebar-toggle"
                onClick={() => setSidebarOpen((current) => !current)}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                {sidebarOpen ? '收起侧边栏' : '打开侧边栏'}
              </button>
            </div>
          ) : null}

          {layoutMode === 'single-pane' && sidebarOpen ? (
            <aside data-testid="calendar-inline-sidebar" className="mb-8 border-b border-stone-200 pb-8">
              {renderSidebarContent(showSidebarTabs)}
            </aside>
          ) : null}

          {heatmapSection}
          {detailSection}
        </div>

        {layoutMode === 'two-pane' ? (
          <aside data-testid="calendar-sidebar" className="min-w-0 shrink-0 border-l border-stone-200 pl-6">
            {renderSidebarContent(false)}
          </aside>
        ) : null}
      </div>
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
    <div className="py-4 first:pt-0">
      <div className="grid gap-4">
        <input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          className="w-full border-b border-stone-200 bg-transparent px-0 py-2 text-base font-medium text-stone-900 outline-none transition focus:border-stone-400"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_130px_120px]">
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
          <input
            type="time"
            value={draft.startTime}
            disabled={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white disabled:bg-stone-100"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CalendarEntry['status'])}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
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
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-stone-400">{entry.source === 'manual' ? '手动创建' : 'AI 建议已采纳'}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSave()
              }}
              disabled={saving}
              className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRemove()
              }}
              disabled={removing}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
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
    <div className="py-4 first:pt-0">
      <div className="border-l-2 border-amber-400 pl-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-amber-700">
          <span className="font-medium uppercase tracking-[0.18em]">来自块 {suggestion.sourceBlockId.slice(0, 8)}</span>
          <span>置信度 {Math.round(suggestion.confidence * 100)}%</span>
        </div>
        <div className="grid gap-3">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="w-full border-b border-amber-200 bg-transparent px-0 py-2 text-base font-medium text-stone-900 outline-none transition focus:border-amber-400"
          />
          <div className="grid gap-3 md:grid-cols-[1fr_130px]">
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white"
            />
            <input
              type="time"
              value={draft.startTime}
              disabled={draft.allDay}
              onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white disabled:bg-amber-100/60"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-amber-900">
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
            className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white"
          />
          {suggestion.evidenceText ? <p className="text-xs leading-5 text-amber-800">证据：{suggestion.evidenceText}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleAccept()
              }}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? '处理中…' : '采纳为正式安排'}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleDismiss()
              }}
              disabled={busy}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
            >
              忽略
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
