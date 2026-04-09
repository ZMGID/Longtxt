import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Block, CalendarDayDetail, CalendarEntry, CalendarHeatmap, CalendarSuggestion } from '../../shared/types'
import { I18nContext, type I18nContextValue } from '../i18n/context'
import { formatCalendarDateLabel } from '../lib/calendar'
import { CalendarView } from './CalendarView'

const hookMocks = vi.hoisted(() => ({
  useCalendarYears: vi.fn(),
  useCalendarHeatmap: vi.fn(),
  useCalendarDayDetail: vi.fn(),
  useUpcomingCalendarEntries: vi.fn(),
}))

const calendarApiMocks = vi.hoisted(() => ({
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  removeEntry: vi.fn(),
  acceptSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(),
}))

vi.mock('../hooks/useCalendar', () => ({
  useCalendarYears: hookMocks.useCalendarYears,
  useCalendarHeatmap: hookMocks.useCalendarHeatmap,
  useCalendarDayDetail: hookMocks.useCalendarDayDetail,
  useUpcomingCalendarEntries: hookMocks.useUpcomingCalendarEntries,
}))

vi.mock('../lib/changbu', () => ({
  changbu: {
    calendar: calendarApiMocks,
  },
}))

vi.mock('./toast-context', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

const settings = {
  aiSuggestionsEnabled: true,
  autoAcceptAiSuggestions: false,
  maxSuggestionsPerBlock: 3,
  upcomingDays: 7,
}

function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function buildHeatmapDays(): CalendarHeatmap['days'] {
  const days: CalendarHeatmap['days'] = []
  const cursor = new Date(Date.UTC(2026, 0, 1))

  for (let index = 0; index < 365; index += 1) {
    const key = formatDateKey(cursor)
    const special =
      key === '2026-04-05'
        ? { blockCount: 4, intensityLevel: 3, hasEntries: true, hasSuggestions: true }
        : key === '2026-04-06'
          ? { blockCount: 2, intensityLevel: 2, hasEntries: true, hasSuggestions: true }
          : { blockCount: 0, intensityLevel: 0, hasEntries: false, hasSuggestions: false }

    days.push({
      date: key,
      ...special,
    })

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

const heatmapData: CalendarHeatmap = {
  year: 2026,
  totalContributions: 6,
  maxBlockCount: 4,
  days: buildHeatmapDays(),
}

const todayBlock: Block = {
  id: 'block-1',
  content: '今天块正文，包含更长一点的内容用于展示。',
  tags: [
    {
      id: 'tag-1',
      name: '计划',
      isDefault: false,
      source: 'manual',
      kind: 'user',
    },
  ],
  createdAt: '2026-04-05T09:15:00.000Z',
  updatedAt: '2026-04-05T09:20:00.000Z',
  status: 'ready',
  aiMode: 'live',
  summary: '今天块摘要',
  errorMessage: null,
}

const nextDayBlock: Block = {
  id: 'block-2',
  content: '第六天块正文。',
  tags: [
    {
      id: 'tag-2',
      name: '会议',
      isDefault: false,
      source: 'manual',
      kind: 'user',
    },
  ],
  createdAt: '2026-04-06T10:00:00.000Z',
  updatedAt: '2026-04-06T10:10:00.000Z',
  status: 'ready',
  aiMode: 'live',
  summary: '第六天块摘要',
  errorMessage: null,
}

const todayEntry: CalendarEntry = {
  id: 'entry-1',
  title: '现有安排',
  notes: '初始备注',
  date: '2026-04-05',
  startTime: '09:30',
  allDay: false,
  status: 'planned',
  source: 'manual',
  linkedBlockId: null,
  createdAt: '2026-04-05T08:30:00.000Z',
  updatedAt: '2026-04-05T08:40:00.000Z',
}

const tomorrowEntry: CalendarEntry = {
  id: 'entry-2',
  title: '明天会议',
  notes: null,
  date: '2026-04-06',
  startTime: '10:00',
  allDay: false,
  status: 'planned',
  source: 'manual',
  linkedBlockId: null,
  createdAt: '2026-04-05T18:00:00.000Z',
  updatedAt: '2026-04-05T18:05:00.000Z',
}

const todaySuggestion: CalendarSuggestion = {
  id: 'suggestion-1',
  title: 'AI 识别会议',
  notes: '来自块的建议备注',
  date: '2026-04-05',
  startTime: '14:00',
  allDay: false,
  sourceBlockId: 'block-1-source',
  confidence: 0.91,
  evidenceText: '明天下午两点开会。',
  createdAt: '2026-04-05T08:50:00.000Z',
  updatedAt: '2026-04-05T08:55:00.000Z',
}

const tomorrowSuggestion: CalendarSuggestion = {
  id: 'suggestion-2',
  title: '第二天 AI 建议',
  notes: null,
  date: '2026-04-06',
  startTime: null,
  allDay: true,
  sourceBlockId: 'block-2-source',
  confidence: 0.87,
  evidenceText: '周一全天准备材料。',
  createdAt: '2026-04-05T19:00:00.000Z',
  updatedAt: '2026-04-05T19:05:00.000Z',
}

const dayDetails: Record<string, CalendarDayDetail> = {
  '2026-04-05': {
    date: '2026-04-05',
    blockCount: 4,
    blocks: [todayBlock],
    entries: [todayEntry],
    suggestions: [todaySuggestion],
  },
  '2026-04-06': {
    date: '2026-04-06',
    blockCount: 2,
    blocks: [nextDayBlock],
    entries: [tomorrowEntry],
    suggestions: [tomorrowSuggestion],
  },
}

let heatmapViewportWidth = 1200

function setWindowSize(width: number, height = 900): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
}

function resizeWindow(width: number, height = window.innerHeight || 900): void {
  setWindowSize(width, height)
  fireEvent(window, new Event('resize'))
}

function setHeatmapViewportWidth(width: number): void {
  heatmapViewportWidth = width
}

function parseSizeFromInlineStyle(style: string, property: 'width' | 'height'): number {
  const match = style.match(new RegExp(`${property}: ([0-9.]+)px`))
  return match ? Number(match[1]) : NaN
}

function createI18nValue(language: 'zh' | 'en'): I18nContextValue {
  return {
    language,
    uiSettings: {
      showMiniTimeline: true,
      language,
    },
    t: (key) => String(key),
    compareText: (left, right) => left.localeCompare(right),
    formatNumber: (value) => String(value),
    formatDate: (value, options) => new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', options).format(new Date(value)),
    formatRelativeTime: () => '',
  }
}

function renderCalendar(width = 1600, language: 'zh' | 'en' = 'zh') {
  setWindowSize(width, 900)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const onJumpToBlock = vi.fn(async () => {})
  const renderResult = render(
    <I18nContext.Provider value={createI18nValue(language)}>
      <QueryClientProvider client={queryClient}>
        <CalendarView settings={settings} onJumpToBlock={onJumpToBlock} />
      </QueryClientProvider>
    </I18nContext.Provider>,
  )

  return {
    ...renderResult,
    queryClient,
    onJumpToBlock,
  }
}

describe('CalendarView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-05T08:00:00.000Z'))
    vi.clearAllMocks()
    heatmapViewportWidth = 1200

    class ResizeObserverMock {
      private readonly callback?: ResizeObserverCallback

      constructor(callback?: ResizeObserverCallback) {
        this.callback = callback
      }

      observe(target?: Element) {
        if (target instanceof HTMLElement) {
          const width = target.getAttribute('style')?.includes('--calendar-cell-size') ? heatmapViewportWidth : 1200
          const entry = [{ contentRect: { width } }] as ResizeObserverEntry[]
          queueMicrotask(() => {
            this.callback?.(entry, this as unknown as ResizeObserver)
          })
        }
      }
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    hookMocks.useCalendarYears.mockReturnValue({
      data: [2026, 2025],
    })
    hookMocks.useCalendarHeatmap.mockImplementation((year: number) => ({
      data: {
        ...heatmapData,
        year,
      },
      isPending: false,
    }))
    hookMocks.useCalendarDayDetail.mockImplementation((date: string) => ({
      data: dayDetails[date] ?? dayDetails['2026-04-05'],
      isPending: false,
    }))
    hookMocks.useUpcomingCalendarEntries.mockReturnValue({
      data: [tomorrowEntry],
      isPending: false,
    })

    setHeatmapViewportWidth(1200)
    calendarApiMocks.updateEntry.mockResolvedValue(todayEntry)
    calendarApiMocks.removeEntry.mockResolvedValue(undefined)
    calendarApiMocks.acceptSuggestion.mockResolvedValue(todayEntry)
    calendarApiMocks.dismissSuggestion.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('places the heatmap at the top and removes redundant overview copy', async () => {
    renderCalendar(1600)

    expect(screen.getByText('全年热力图')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '2026 年记录密度' })).not.toBeInTheDocument()
    expect(screen.queryByText('全年热力图放在最上方；点击任一天，下面直接切到对应日期的工作内容。')).not.toBeInTheDocument()
    expect(screen.getByText('已有安排')).toBeInTheDocument()
    expect(screen.getAllByText('AI 建议').length).toBeGreaterThan(0)
    expect(screen.queryByText('Calendar Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('14 次记录')).not.toBeInTheDocument()
    expect(screen.queryByText('Focus Day')).not.toBeInTheDocument()
  })

  it('uses inset selection styling and stronger in-cell markers for entries and suggestions', async () => {
    renderCalendar(1600)

    const selectedDayLabel = `${formatCalendarDateLabel('2026-04-05')} · 4 个块`

    await waitFor(() => {
      expect(screen.getByRole('button', { name: selectedDayLabel }).getAttribute('style')).toContain('width: 15px')
    })

    const selectedDay = screen.getByRole('button', { name: selectedDayLabel })
    expect(selectedDay).toHaveAttribute('data-selected', 'true')
    expect(selectedDay.getAttribute('style')).toContain('box-shadow: inset 0 0 0 2px #1c1917')
    expect(within(selectedDay).getByTestId('calendar-entry-indicator-2026-04-05')).toBeInTheDocument()
    expect(within(selectedDay).getByTestId('calendar-suggestion-indicator-2026-04-05')).toBeInTheDocument()
  })

  it('refreshes heatmap month labels when language changes without waiting for heatmap data to change', async () => {
    const { queryClient, onJumpToBlock, rerender } = renderCalendar(1600, 'zh')

    await waitFor(() => {
      expect(screen.getByText('1月')).toBeInTheDocument()
    })

    rerender(
      <I18nContext.Provider value={createI18nValue('en')}>
        <QueryClientProvider client={queryClient}>
          <CalendarView settings={settings} onJumpToBlock={onJumpToBlock} />
        </QueryClientProvider>
      </I18nContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Jan')).toBeInTheDocument()
    })
  })

  it('uses a docked desktop sidebar and collapses it on small screens without adding extra scroll owners', async () => {
    const { container } = renderCalendar(1600)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'two-pane')
    })
    expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-sidebar-mode', 'docked')
    expect(screen.getByTestId('calendar-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-sidebar-toggle')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[class*="overflow-y-auto"]').length).toBe(1)

    resizeWindow(880)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'single-pane')
    })
    expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-sidebar-mode', 'collapsed')
    expect(screen.getByTestId('calendar-sidebar-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-inline-sidebar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('calendar-sidebar-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-sidebar-mode', 'inline')
    })
    expect(screen.getByTestId('calendar-inline-sidebar')).toBeInTheDocument()

    resizeWindow(700)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'single-pane')
    })
    expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-sidebar-mode', 'inline')
    expect(screen.getByTestId('calendar-sidebar-tablist')).toBeInTheDocument()
    expect(container.querySelectorAll('[class*="overflow-y-auto"]').length).toBe(1)
  })

  it('recalculates heatmap layout after shrinking to single-pane mode and expanding again', async () => {
    renderCalendar(1200)

    setHeatmapViewportWidth(180)
    resizeWindow(760)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'single-pane')
    })

    const compactDayLabel = `${formatCalendarDateLabel('2026-04-05')} · 4 个块`
    const compactStyle = screen.getByRole('button', { name: compactDayLabel }).getAttribute('style') ?? ''
    expect(screen.getByTestId('calendar-heatmap')).toHaveAttribute('data-mode', 'focused-window')
    expect(screen.getByText('已聚焦当前日期附近')).toBeInTheDocument()
    expect(parseSizeFromInlineStyle(compactStyle, 'width')).toBe(14)
    expect(parseSizeFromInlineStyle(compactStyle, 'height')).toBe(14)
    expect(screen.queryByRole('button', { name: `${formatCalendarDateLabel('2026-01-01')} · 0 个块` })).not.toBeInTheDocument()

    setHeatmapViewportWidth(1200)
    resizeWindow(1600)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'two-pane')
    })

    const expandedStyle = screen.getByRole('button', { name: compactDayLabel }).getAttribute('style') ?? ''
    expect(screen.getByTestId('calendar-heatmap')).toHaveAttribute('data-mode', 'full-year')
    expect(expandedStyle).toContain('width: 15px')
    expect(expandedStyle).toContain('height: 15px')
  })

  it('scrolls back to the top when shrinking into the single-pane layout', async () => {
    renderCalendar(1200)

    const scrollRoot = screen.getByTestId('calendar-scroll-root') as HTMLElement & { scrollTop: number }
    scrollRoot.scrollTop = 240

    resizeWindow(760)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-layout')).toHaveAttribute('data-layout', 'single-pane')
    })

    expect(scrollRoot.scrollTop).toBe(0)
  })

  it('scrolls back to the top when the window shrinks even inside the same layout bucket', async () => {
    renderCalendar(1600)

    const scrollRoot = screen.getByTestId('calendar-scroll-root') as HTMLElement & { scrollTop: number }
    scrollRoot.scrollTop = 240

    resizeWindow(1500)

    await waitFor(() => {
      expect(scrollRoot.scrollTop).toBe(0)
    })
  })

  it('keeps the heatmap pinned to the top when only the window height collapses to the minimum size', async () => {
    renderCalendar(760)

    const scrollRoot = screen.getByTestId('calendar-scroll-root') as HTMLElement & { scrollTop: number }
    scrollRoot.scrollTop = 240

    resizeWindow(760, 560)

    await waitFor(() => {
      expect(scrollRoot.scrollTop).toBe(0)
    })
    expect(scrollRoot).toHaveStyle({ overflowAnchor: 'none' })
    expect(screen.getByTestId('calendar-layout')).toHaveClass('shrink-0')
    expect(screen.getByText('全年热力图').closest('section')).toHaveClass('shrink-0')
    expect(screen.getByRole('heading', { name: formatCalendarDateLabel('2026-04-05') }).closest('section')).toHaveClass('shrink-0')
  })

  it('switches selected date and toggles the unified day detail panels', async () => {
    const { onJumpToBlock } = renderCalendar(1200)
    const targetDayLabel = `${formatCalendarDateLabel('2026-04-06')} · 2 个块`

    fireEvent.click(screen.getByRole('button', { name: targetDayLabel }))

    await waitFor(() => {
      expect(screen.getAllByText(formatCalendarDateLabel('2026-04-06')).length).toBeGreaterThan(0)
    })
    expect(screen.getByText('为 2026-04-06 添加安排')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /AI 建议/ })[0])
    expect(screen.getByDisplayValue('第二天 AI 建议')).toBeInTheDocument()
    expect(screen.getByText(/证据[:：]\s*周一全天准备材料。/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /当天块/ })[0])
    fireEvent.click(screen.getByText('第六天块摘要').closest('button') as HTMLButtonElement)

    expect(onJumpToBlock).toHaveBeenCalledWith('block-2')
  })

  it('keeps create, edit, delete, and suggestion actions working in the refactored workspace', async () => {
    renderCalendar(1200)

    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '新的同步' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建安排' }))

    await waitFor(() => {
      expect(calendarApiMocks.createEntry).toHaveBeenCalledWith({
        title: '新的同步',
        date: '2026-04-05',
        allDay: true,
        startTime: null,
        notes: null,
      })
    })

    fireEvent.change(screen.getByDisplayValue('现有安排'), {
      target: { value: '更新后的安排' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(calendarApiMocks.updateEntry).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          title: '更新后的安排',
          date: '2026-04-05',
          allDay: false,
          startTime: '09:30',
          notes: '初始备注',
          status: 'planned',
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(calendarApiMocks.removeEntry).toHaveBeenCalledWith('entry-1')
    })

    fireEvent.click(screen.getAllByRole('button', { name: /AI 建议/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '采纳为正式安排' }))

    await waitFor(() => {
      expect(calendarApiMocks.acceptSuggestion).toHaveBeenCalledWith(
        'suggestion-1',
        expect.objectContaining({
          title: 'AI 识别会议',
          date: '2026-04-05',
          allDay: false,
          startTime: '14:00',
          notes: '来自块的建议备注',
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '忽略' }))
    await waitFor(() => {
      expect(calendarApiMocks.dismissSuggestion).toHaveBeenCalledWith('suggestion-1')
    })
  })
})
