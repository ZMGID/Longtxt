import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { CalendarSettings } from '../../shared/types'
import { useCalendarDayDetail, useCalendarHeatmap, useCalendarYears, useUpcomingCalendarEntries } from '../hooks/useCalendar'
import { useI18n } from '../i18n/useI18n'
import { buildCalendarHeatmapColumns, groupUpcomingEntries } from '../lib/calendar'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { CalendarDetail } from './calendar/CalendarDetail'
import { CalendarHeatmap } from './calendar/CalendarHeatmap'
import { CalendarSidebar } from './calendar/CalendarSidebar'
import {
  buildEntryDraft,
  buildEntryPayload,
  computeEntryIndicatorStyle,
  computeHeatmapStyles,
  computeSuggestionIndicatorStyle,
  getColumnMonthFallbackLabel,
  HEATMAP_FOCUSED_WINDOW_BREAKPOINT,
  resolveLayoutMode,
  shouldUseSidebarTabs,
  todayDateKey,
  type CalendarDetailTab,
  type CalendarEntryDraft,
  type CalendarLayoutMode,
  type CalendarSidebarTab,
  type HeatmapDisplayMode,
} from './calendar/helpers'
import { useToast } from './toast-context'

interface CalendarViewProps {
  settings: CalendarSettings
  onJumpToBlock: (blockId: string) => Promise<void>
  selectedDateOverride?: string | null
  onSelectedDateOverrideHandled?: () => void
}

export function CalendarView({
  settings,
  onJumpToBlock,
  selectedDateOverride,
  onSelectedDateOverrideHandled,
}: CalendarViewProps) {
  const { language } = useI18n()
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
  const columns = useMemo(() => buildCalendarHeatmapColumns(heatmap?.days ?? [], language), [heatmap?.days, language])

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
            monthLabel: getColumnMonthFallbackLabel(column, language),
          }
        : column
    ))
  }, [activeYear, columns, currentYear, heatmapDisplayMode, heatmapVisibleColumnCount, language, selectedDate, today])

  const groupedUpcoming = useMemo(() => groupUpcomingEntries(upcomingQuery.data ?? []), [upcomingQuery.data])

  const copy = {
    zh: {
      createSuccess: '日历安排已创建。',
      createFailed: '创建安排失败。',
      detailEntriesLabel: '安排',
      detailEntriesTitle: '当天安排',
      detailEntriesEmpty: '这一天还没有正式安排。可以在侧边栏手动添加，或把 AI 建议采纳进来。',
      detailSuggestionsLabel: 'AI 建议',
      detailSuggestionsTitleAuto: 'AI 建议（自动加入已开启）',
      detailSuggestionsTitle: '待确认建议',
      detailSuggestionsEmptyAuto: '已开启自动加入日历。新识别到的明确安排会直接进入"安排"，这里只会保留尚未被自动处理的旧建议。',
      detailSuggestionsEmpty: '当前没有待确认的日期建议。含有明确日期的块在 enrich 完成后会出现在这里。',
      detailBlocksLabel: '当天块',
      detailBlocksTitle: '当天写下的块',
      detailBlocksEmpty: '这一天没有写入块。',
      newEntryTitle: `为 ${selectedDate} 添加安排`,
      newEntryHint: '默认围绕当前选中日期创建，也可以在提交前改到别的日期。',
      fieldTitle: '标题',
      fieldDate: '日期',
      fieldAllDay: '全天安排',
      fieldStartTime: '开始时间',
      fieldNotes: '备注',
      newEntryEyebrow: '新建安排',
      upcomingEyebrow: '未来安排',
      titlePlaceholder: '例如：和设计师过一遍首屏',
      notesPlaceholder: '可选，补充上下文。',
      creating: '创建中…',
      createEntry: '创建安排',
      upcomingTitle: `未来 ${settings.upcomingDays} 天`,
      upcomingHint: '保留未来安排概览，方便从日视图直接切过去处理。',
      upcomingLoading: '正在加载未来安排…',
      statusPlanned: '待办',
      statusDone: '已完成',
      statusCanceled: '已取消',
      upcomingEmpty: '未来几天还没有安排。',
      sidebarTitle: '安排与未来',
      sidebarLabel: '侧边栏',
      sidebarCreate: '新建安排',
      sidebarUpcoming: '未来安排',
      heatmapTitle: '全年热力图',
      heatmapLoading: '正在加载年度热力图…',
      heatmapEmpty: '当前年份还没有可展示的日历记录。',
      heatmapFocused: '已聚焦当前日期附近',
      density: '密度',
      less: '少',
      more: '多',
      hasEntries: '已有安排',
      hasSuggestions: 'AI 建议',
      detailLabel: '当天详情',
      detailCurrent: '当前 {{title}} · {{count}} 项',
      collapseSidebar: '收起侧边栏',
      openSidebar: '打开侧边栏',
      blocksSuffix: '个块',
      detailLoading: '正在加载当天详情…',
      weekLabels: ['一', '', '三', '', '五', '', ''] as const,
    },
    en: {
      createSuccess: 'Calendar entry created.',
      createFailed: 'Failed to create calendar entry.',
      detailEntriesLabel: 'Entries',
      detailEntriesTitle: 'Entries for this day',
      detailEntriesEmpty: 'No formal entries for this day yet. Add one manually from sidebar or accept an AI suggestion.',
      detailSuggestionsLabel: 'AI suggestions',
      detailSuggestionsTitleAuto: 'AI suggestions (auto-add on)',
      detailSuggestionsTitle: 'Pending suggestions',
      detailSuggestionsEmptyAuto: 'Auto-add is enabled. Clearly identified future plans go directly into Entries, and only older unresolved suggestions stay here.',
      detailSuggestionsEmpty: 'No pending date suggestions right now. Blocks with explicit future dates will appear here after enrich finishes.',
      detailBlocksLabel: 'Blocks',
      detailBlocksTitle: 'Blocks written that day',
      detailBlocksEmpty: 'No blocks were written on this day.',
      newEntryTitle: `Add an entry for ${selectedDate}`,
      newEntryHint: 'Creation defaults to the selected date, but you can change the date before submitting.',
      fieldTitle: 'Title',
      fieldDate: 'Date',
      fieldAllDay: 'All-day entry',
      fieldStartTime: 'Start time',
      fieldNotes: 'Notes',
      newEntryEyebrow: 'New Entry',
      upcomingEyebrow: 'Upcoming',
      titlePlaceholder: 'Example: review hero section with designer',
      notesPlaceholder: 'Optional extra context.',
      creating: 'Creating…',
      createEntry: 'Create entry',
      upcomingTitle: `Next ${settings.upcomingDays} days`,
      upcomingHint: 'Keep a compact overview of upcoming items so you can jump over from the day view quickly.',
      upcomingLoading: 'Loading upcoming entries…',
      statusPlanned: 'Planned',
      statusDone: 'Done',
      statusCanceled: 'Canceled',
      upcomingEmpty: 'No upcoming entries in the next few days.',
      sidebarTitle: 'Entries & upcoming',
      sidebarLabel: 'Sidebar',
      sidebarCreate: 'New entry',
      sidebarUpcoming: 'Upcoming',
      heatmapTitle: 'Year heatmap',
      heatmapLoading: 'Loading yearly heatmap…',
      heatmapEmpty: 'No calendar activity to display for this year yet.',
      heatmapFocused: 'Focused around current date',
      density: 'Density',
      less: 'Less',
      more: 'More',
      hasEntries: 'Has entries',
      hasSuggestions: 'AI suggestions',
      detailLabel: 'Day detail',
      detailCurrent: 'Current {{title}} · {{count}} items',
      collapseSidebar: 'Hide sidebar',
      openSidebar: 'Show sidebar',
      blocksSuffix: 'blocks',
      detailLoading: 'Loading day detail…',
      weekLabels: ['Mon', '', 'Wed', '', 'Fri', '', ''] as const,
    },
  }[language]

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
      toast('success', copy.createSuccess)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : copy.createFailed)
    } finally {
      setCreating(false)
    }
  }

  const heatmapStyles = useMemo(() => computeHeatmapStyles(heatmapCellSize, heatmapGapSize), [heatmapCellSize, heatmapGapSize])
  const heatmapEntryIndicatorStyle = useMemo(() => computeEntryIndicatorStyle(heatmapCellSize), [heatmapCellSize])
  const heatmapSuggestionIndicatorStyle = useMemo(() => computeSuggestionIndicatorStyle(heatmapCellSize), [heatmapCellSize])
  const showHeatmapEntryIndicator = heatmapCellSize >= 8
  const showHeatmapSuggestionIndicator = heatmapCellSize >= 7

  const handleUpcomingEntrySelect = useCallback((date: string) => {
    setSelectedDate(date)
    setDetailTab('entries')
  }, [])

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
                <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">{copy.sidebarLabel}</p>
              </div>
              <button
                type="button"
                data-testid="calendar-sidebar-toggle"
                onClick={() => setSidebarOpen((current) => !current)}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                {sidebarOpen ? copy.collapseSidebar : copy.openSidebar}
              </button>
            </div>
          ) : null}

          {layoutMode === 'single-pane' && sidebarOpen ? (
            <aside data-testid="calendar-inline-sidebar" className="mb-8 border-b border-stone-200 pb-8">
              <CalendarSidebar
                compact={showSidebarTabs}
                draft={draft}
                onDraftChange={setDraft}
                creating={creating}
                onCreateEntry={() => {
                  void handleCreateEntry()
                }}
                groupedUpcoming={groupedUpcoming}
                upcomingIsPending={upcomingQuery.isPending}
                onEntryDateSelect={handleUpcomingEntrySelect}
                sidebarTab={sidebarTab}
                onSidebarTabChange={setSidebarTab}
                copy={copy}
              />
            </aside>
          ) : null}

          <CalendarHeatmap
            activeYear={activeYear}
            availableYears={availableYears}
            onYearChange={setActiveYear}
            isPending={heatmapQuery.isPending}
            visibleColumns={visibleHeatmapColumns}
            displayMode={heatmapDisplayMode}
            containerRef={heatmapContainerRef}
            styles={heatmapStyles}
            showWeekLabels={showWeekLabels}
            cellSize={heatmapCellSize}
            gapSize={heatmapGapSize}
            entryIndicatorStyle={heatmapEntryIndicatorStyle}
            suggestionIndicatorStyle={heatmapSuggestionIndicatorStyle}
            showEntryIndicator={showHeatmapEntryIndicator}
            showSuggestionIndicator={showHeatmapSuggestionIndicator}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            copy={copy}
          />

          <CalendarDetail
            selectedDate={selectedDate}
            dayDetail={dayDetail}
            isPending={dayDetailQuery.isPending}
            detailTab={detailTab}
            onDetailTabChange={setDetailTab}
            onJumpToBlock={onJumpToBlock}
            onRefresh={refreshCalendar}
            autoAcceptAiSuggestions={settings.autoAcceptAiSuggestions}
            copy={copy}
          />
        </div>

        {layoutMode === 'two-pane' ? (
          <aside data-testid="calendar-sidebar" className="min-w-0 shrink-0 border-l border-stone-200 pl-6">
            <CalendarSidebar
              compact={false}
              draft={draft}
              onDraftChange={setDraft}
              creating={creating}
              onCreateEntry={() => {
                void handleCreateEntry()
              }}
              groupedUpcoming={groupedUpcoming}
              upcomingIsPending={upcomingQuery.isPending}
              onEntryDateSelect={handleUpcomingEntrySelect}
              sidebarTab={sidebarTab}
              onSidebarTabChange={setSidebarTab}
              copy={copy}
            />
          </aside>
        ) : null}
      </div>
    </section>
  )
}
