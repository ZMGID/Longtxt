import { render, screen, waitFor } from '@testing-library/react'
import { Fragment, forwardRef, useImperativeHandle, type ComponentProps, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VirtuosoHandle } from 'react-virtuoso'

import type { Block } from '../../shared/types'
import { Timeline } from './Timeline'

const scrollToIndexMock = vi.fn()

vi.mock('react-virtuoso', async () => {
  type MockVirtuosoProps = ComponentProps<typeof Timeline>['blocks'] extends Block[]
    ? {
        data: Block[]
        itemContent: (index: number, item: Block) => ReactNode
        components?: {
          Footer?: () => ReactNode
        }
        rangeChanged?: (range: { startIndex: number; endIndex: number }) => void
      }
    : never

  const MockVirtuoso = forwardRef<VirtuosoHandle, MockVirtuosoProps>(function MockVirtuoso(props, _ref) {
    const { data, itemContent, components, rangeChanged } = props
    const Footer = components?.Footer

    useImperativeHandle(_ref, () => ({ scrollToIndex: scrollToIndexMock }) as unknown as VirtuosoHandle)

    rangeChanged?.({
      startIndex: 0,
      endIndex: Math.max(0, data.length - 1),
    })

    return (
      <div data-testid="mock-virtuoso">
        {data.map((item, index) => (
          <Fragment key={item.id}>{itemContent(index, item)}</Fragment>
        ))}
        {Footer ? <Footer /> : null}
      </div>
    )
  })

  return {
    Virtuoso: MockVirtuoso,
  }
})

const sampleBlocks: Block[] = [
  {
    id: 'block-1',
    content: '第一条',
    tags: [],
    createdAt: '2026-03-31T10:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-2',
    content: '第二条',
    tags: [],
    createdAt: '2026-03-30T08:00:00.000Z',
    updatedAt: '2026-03-30T08:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
]

function renderTimeline(showMiniTimeline: boolean) {
  render(
    <Timeline
      blocks={sampleBlocks}
      loading={false}
      loadingMore={false}
      hasMore={false}
      showMiniTimeline={showMiniTimeline}
      tagSuggestions={[]}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onTagClick={vi.fn()}
      onLoadMore={vi.fn()}
    />,
  )
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1024,
  })
  vi.clearAllMocks()
})

describe('Timeline', () => {
  it('renders the mini timeline when enabled', () => {
    renderTimeline(true)

    expect(screen.getByTestId('mini-timeline')).toBeInTheDocument()
    expect(screen.getByText('03.31')).toBeInTheDocument()
    expect(screen.getByText('2026年3月31日周二')).toBeInTheDocument()
  })

  it('does not render the mini timeline when disabled', () => {
    renderTimeline(false)

    expect(screen.queryByTestId('mini-timeline')).not.toBeInTheDocument()
  })

  it('automatically hides the mini timeline on narrow viewports to avoid layout crowding', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 640,
    })

    renderTimeline(true)

    expect(screen.queryByTestId('mini-timeline')).not.toBeInTheDocument()
  })

  it('scrolls to the matching date when focusedDateKey changes', async () => {
    render(
      <Timeline
        blocks={sampleBlocks}
        loading={false}
        loadingMore={false}
        hasMore={false}
        showMiniTimeline
        tagSuggestions={[]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onTagClick={vi.fn()}
        onLoadMore={vi.fn()}
        focusedDateKey="2026-03-30"
      />,
    )

    await waitFor(() => {
      expect(scrollToIndexMock).toHaveBeenCalledWith({ index: 1, align: 'start', behavior: 'auto' })
    })
  })

  it('reports the visible active date back to the workspace', async () => {
    const onActiveDateKeyChange = vi.fn()

    render(
      <Timeline
        blocks={sampleBlocks}
        loading={false}
        loadingMore={false}
        hasMore={false}
        showMiniTimeline
        tagSuggestions={[]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onTagClick={vi.fn()}
        onLoadMore={vi.fn()}
        onActiveDateKeyChange={onActiveDateKeyChange}
      />,
    )

    await waitFor(() => {
      expect(onActiveDateKeyChange).toHaveBeenCalledWith('2026-03-31')
    })
  })
})
