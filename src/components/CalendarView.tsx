import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

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

const INTENSITY_CLASSES = [
  'bg-stone-100',
  'bg-emerald-100',
  'bg-emerald-200',
  'bg-emerald-400',
  'bg-emerald-700',
] as const

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
  const today = todayDateKey()
  const currentYear = Number(today.slice(0, 4))
  const [activeYear, setActiveYear] = useState(currentYear)
  const [selectedDate, setSelectedDate] = useState(today)
  const [draft, setDraft] = useState<CalendarEntryDraft>(() => buildEntryDraft(today))
  const [creating, setCreating] = useState(false)
  const [heatmapCellSize, setHeatmapCellSize] = useState(16)
  const [heatmapGapSize, setHeatmapGapSize] = useState(4)
  const [showWeekLabels, setShowWeekLabels] = useState(true)
  const yearsQuery = useCalendarYears()
  const availableYears = yearsQuery.data ?? [currentYear]
  const heatmapQuery = useCalendarHeatmap(activeYear)
  const dayDetailQuery = useCalendarDayDetail(selectedDate)
  const upcomingQuery = useUpcomingCalendarEntries(settings.upcomingDays)
  const heatmap = heatmapQuery.data
  const dayDetail = dayDetailQuery.data
  const columns = useMemo(() => buildCalendarHeatmapColumns(heatmap?.days ?? []), [heatmap?.days])
  const groupedUpcoming = useMemo(() => groupUpcomingEntries(upcomingQuery.data ?? []), [upcomingQuery.data])

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
    const container = heatmapContainerRef.current

    if (!container || columns.length === 0) {
      return
    }

    function syncHeatmapLayout(width: number): void {
      const maxCellSize = width >= 1280 ? 16 : width >= 1024 ? 15 : 14
      const preferredGap = width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 720 ? 2 : 1
      const hardMinCellSize = width >= 720 ? 6 : 4

      const computeMetrics = (withWeekLabels: boolean) => {
        const weekLabelWidth = withWeekLabels ? 28 : 0
        const sectionGap = withWeekLabels ? 12 : 0
        const availableGridWidth = Math.max(240, width - weekLabelWidth - sectionGap)
        const gap = preferredGap
        const exactCellSize = (availableGridWidth - gap * (columns.length - 1)) / columns.length

        return {
          cellSize: Math.min(maxCellSize, Math.max(hardMinCellSize, exactCellSize)),
          gapSize: gap,
        }
      }

      let nextShowWeekLabels = width >= 980
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
  }, [columns.length])

  async function refreshCalendar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
  }

  async function handleCreateEntry(): Promise<void> {
    setCreating(true)

    try {
      await changbu.calendar.createEntry(buildEntryPayload(draft))
      await refreshCalendar()
      setDraft(buildEntryDraft(selectedDate))
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

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1">
      <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(68,48,22,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Calendar</p>
            <h2 className="mt-2 text-3xl font-semibold text-stone-900">
              {heatmap?.totalContributions ?? 0} 次记录分布在 {activeYear}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              每个小方格代表一天。颜色越深，表示当天写入的块越多；边框和角标代表当天还有计划或 AI 建议。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setActiveYear(year)}
                className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  year === activeYear ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        <div ref={heatmapContainerRef} className="mt-5 overflow-hidden" style={heatmapStyles}>
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

                      return (
                        <button
                          key={day.date}
                          type="button"
                          title={`${formatCalendarDateLabel(day.date)} · ${day.blockCount} 个块`}
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

        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-stone-500">
          <span>Less</span>
          {INTENSITY_CLASSES.map((className) => (
            <span key={className} className={`h-4 w-4 rounded-[4px] border border-black/5 ${className}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-x-hidden xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,22rem)]">
        <div className="min-h-0 space-y-4 overflow-x-hidden 2xl:overflow-y-auto 2xl:pr-1">
          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Selected Day</p>
                <h3 className="mt-2 text-2xl font-semibold text-stone-900">{formatCalendarDateLabel(selectedDate)}</h3>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">{dayDetail?.blockCount ?? 0} 个块</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{dayDetail?.entries.length ?? 0} 个安排</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{dayDetail?.suggestions.length ?? 0} 条 AI 建议</span>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Entries</p>
              <h3 className="mt-2 text-xl font-semibold text-stone-900">当天安排</h3>
            </div>
            {dayDetailQuery.isPending ? (
              <p className="text-sm text-stone-400">正在加载当天详情…</p>
            ) : dayDetail && dayDetail.entries.length > 0 ? (
              <div className="space-y-3">
                {dayDetail.entries.map((entry) => (
                  <EditableEntryCard key={entry.id} entry={entry} onSaved={refreshCalendar} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-400">这一天还没有正式安排。可以在右侧手动添加，或把下面的 AI 建议采纳进来。</p>
            )}
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Suggestions</p>
              <h3 className="mt-2 text-xl font-semibold text-stone-900">AI 识别到的待确认计划</h3>
            </div>
            {dayDetailQuery.isPending ? (
              <p className="text-sm text-stone-400">正在加载 AI 建议…</p>
            ) : dayDetail && dayDetail.suggestions.length > 0 ? (
              <div className="space-y-3">
                {dayDetail.suggestions.map((suggestion) => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} onUpdated={refreshCalendar} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-400">当前没有待确认的日期建议。含有明确日期的块在 enrich 完成后会出现在这里。</p>
            )}
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Blocks</p>
              <h3 className="mt-2 text-xl font-semibold text-stone-900">当天写下的块</h3>
            </div>
            {dayDetailQuery.isPending ? (
              <p className="text-sm text-stone-400">正在加载块列表…</p>
            ) : dayDetail && dayDetail.blocks.length > 0 ? (
              <div className="space-y-3">
                {dayDetail.blocks.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => { void onJumpToBlock(block.id) }}
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{formatBlockTime(block.createdAt)}</span>
                      <span className="text-xs text-stone-400">{block.tags.slice(0, 3).map((tag) => tag.name).join(' · ')}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium leading-6 text-stone-900">
                      {block.summary || block.content.slice(0, 120)}
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm leading-6 text-stone-500">{block.content}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-400">这一天没有写入块。</p>
            )}
          </section>
        </div>

        <aside className="min-h-0 space-y-4 overflow-x-hidden 2xl:overflow-y-auto">
          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">New Entry</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-900">为 {selectedDate} 添加安排</h3>
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
              <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
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
                onClick={() => { void handleCreateEntry() }}
                disabled={creating}
                className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {creating ? '创建中…' : '创建安排'}
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">Upcoming</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-900">未来 {settings.upcomingDays} 天</h3>
            <div className="mt-4 space-y-4">
              {upcomingQuery.isPending ? (
                <p className="text-sm text-stone-400">正在加载未来安排…</p>
              ) : groupedUpcoming.length > 0 ? (
                groupedUpcoming.map((group) => (
                  <div key={group.date}>
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
                      {formatCalendarDateLabel(group.date)}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setSelectedDate(entry.date)}
                          className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3 text-left transition hover:border-stone-300 hover:bg-white"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-stone-900">{entry.title}</span>
                            <span className="text-xs text-stone-400">{formatCalendarTimeLabel(entry.startTime)}</span>
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
        </aside>
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
              onClick={() => { void handleSave() }}
              disabled={saving}
              className="rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => { void handleRemove() }}
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
            onClick={() => { void handleAccept() }}
            disabled={busy}
            className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? '处理中…' : '采纳为正式安排'}
          </button>
          <button
            type="button"
            onClick={() => { void handleDismiss() }}
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
