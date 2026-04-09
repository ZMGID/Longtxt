import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Block, CalendarEntry } from '../../shared/types'
import { I18nContext } from '../i18n/context'
import { resolveMessage, type MessageKey } from '../i18n/messages'
import type { AppLanguage } from '../i18n/locale'
import { TimelineWorkspace } from './TimelineWorkspace'

const hookMocks = vi.hoisted(() => ({
  useUpcomingCalendarEntries: vi.fn(),
}))

vi.mock('../hooks/useCalendar', () => ({
  useUpcomingCalendarEntries: hookMocks.useUpcomingCalendarEntries,
}))

vi.mock('./Timeline', () => ({
  Timeline: ({
    focusedDateKey,
    onActiveDateKeyChange,
  }: {
    focusedDateKey?: string | null
    onActiveDateKeyChange?: (dateKey: string | null) => void
  }) => (
    <div data-testid="mock-timeline">
      <div data-testid="mock-focused-date">{focusedDateKey ?? ''}</div>
      <button type="button" onClick={() => onActiveDateKeyChange?.('2026-04-05')}>
        sync-active-date
      </button>
    </div>
  ),
}))

const sampleBlocks: Block[] = [
  {
    id: 'block-1',
    content: '最新块',
    tags: [],
    createdAt: '2026-04-07T10:00:00.000Z',
    updatedAt: '2026-04-07T10:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-2',
    content: '旧块',
    tags: [],
    createdAt: '2026-04-05T08:00:00.000Z',
    updatedAt: '2026-04-05T08:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
]

const upcomingEntries: CalendarEntry[] = [
  {
    id: 'entry-1',
    title: '和设计师确认首屏',
    notes: null,
    date: '2026-04-08',
    startTime: '09:30',
    allDay: false,
    status: 'planned',
    source: 'manual',
    linkedBlockId: null,
    createdAt: '2026-04-07T10:00:00.000Z',
    updatedAt: '2026-04-07T10:00:00.000Z',
  },
]

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

function renderWorkspace({
  width = 1400,
  blocks = sampleBlocks,
  entries = upcomingEntries,
  language = 'zh',
}: {
  width?: number
  blocks?: Block[]
  entries?: CalendarEntry[]
  language?: AppLanguage
} = {}) {
  setWindowSize(width)
  hookMocks.useUpcomingCalendarEntries.mockReturnValue({
    data: entries,
    isPending: false,
  })

  const onOpenCalendarDate = vi.fn()
  const onOpenReview = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const translate = (key: MessageKey) => resolveMessage(key, language)

  const renderResult = render(
    <I18nContext.Provider
      value={{
        language,
        uiSettings: { showMiniTimeline: true, language },
        t: translate,
        compareText: (left, right) => left.localeCompare(right),
        formatNumber: (value) => `${value}`,
        formatDate: (value) => String(value),
        formatRelativeTime: (value) => String(value),
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TimelineWorkspace
          blocks={blocks}
          loading={false}
          loadingMore={false}
          hasMore={false}
          showMiniTimeline
          tagSuggestions={[]}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
          onAddTag={vi.fn(async () => {})}
          onRemoveTag={vi.fn(async () => {})}
          onTagClick={vi.fn()}
          onLoadMore={vi.fn(async () => {})}
          upcomingDays={30}
          onOpenCalendarDate={onOpenCalendarDate}
          onOpenReview={onOpenReview}
        />
      </QueryClientProvider>
    </I18nContext.Provider>,
  )

  return {
    ...renderResult,
    onOpenCalendarDate,
    onOpenReview,
    queryClient,
  }
}

afterEach(() => {
  setWindowSize(1400)
  vi.useRealTimers()
  vi.clearAllMocks()
})

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 320,
            height: 860,
          },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }

  disconnect(): void {}
  unobserve(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

describe('TimelineWorkspace', () => {
  it('renders the right sidebar on wide viewports', () => {
    renderWorkspace({ width: 1400 })

    expect(screen.getByTestId('timeline-sidebar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TODO' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '回顾' })).toBeInTheDocument()
  })

  it('hides the right sidebar on narrow viewports', () => {
    renderWorkspace({ width: 960 })

    expect(screen.queryByTestId('timeline-sidebar')).not.toBeInTheDocument()
  })

  it('shows the right sidebar on medium-wide viewports without requiring an extra-wide window', () => {
    renderWorkspace({ width: 1000 })

    expect(screen.getByTestId('timeline-sidebar')).toBeInTheDocument()
  })

  it('focuses the timeline when a calendar day is clicked', () => {
    renderWorkspace({ width: 1400 })

    const sidebar = screen.getByTestId('timeline-sidebar')
    const matchingButtons = within(sidebar).getAllByRole('button', { name: /2026年4月5日/ })

    fireEvent.click(matchingButtons[0])
    expect(screen.getByTestId('mock-focused-date')).toHaveTextContent('2026-04-05')
  })

  it('opens the calendar view when a scheduled todo is clicked', () => {
    const { onOpenCalendarDate } = renderWorkspace({ width: 1400 })

    fireEvent.click(screen.getByRole('button', { name: /和设计师确认首屏/ }))

    expect(onOpenCalendarDate).toHaveBeenCalledWith('2026-04-08')
  })

  it('switches to review tools in the timeline sidebar', () => {
    const { onOpenReview } = renderWorkspace({ width: 1400 })

    fireEvent.click(screen.getByRole('button', { name: '回顾' }))

    expect(screen.getByRole('button', { name: '每日回顾' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 洞察' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '近期变化' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '每日回顾' }))

    expect(onOpenReview).toHaveBeenCalledWith('daily-review', '2026-04-07')
  })

  it('localizes review mode controls in english', () => {
    const { onOpenReview } = renderWorkspace({ width: 1400, language: 'en' })

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('button', { name: 'Daily Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI Insights' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recent Shifts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Daily Review' }))

    expect(onOpenReview).toHaveBeenCalledWith('daily-review', '2026-04-07')
  })

  it('adopts the latest loaded day when blocks arrive after an empty initial render', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T09:00:00.000Z'))

    const { rerender, queryClient } = renderWorkspace({ width: 1400, blocks: [] })

    expect(screen.getByText(/(?:2026年5月|5月 2026)/)).toBeInTheDocument()

    rerender(
      <QueryClientProvider client={queryClient}>
        <TimelineWorkspace
          blocks={sampleBlocks}
          loading={false}
          loadingMore={false}
          hasMore={false}
          showMiniTimeline
          tagSuggestions={[]}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
          onAddTag={vi.fn(async () => {})}
          onRemoveTag={vi.fn(async () => {})}
          onTagClick={vi.fn()}
          onLoadMore={vi.fn(async () => {})}
          upcomingDays={30}
          onOpenCalendarDate={vi.fn()}
          onOpenReview={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText(/(?:2026年4月|4月 2026)/)).toBeInTheDocument()
  })
})
