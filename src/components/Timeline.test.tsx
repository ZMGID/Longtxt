import { render, screen } from '@testing-library/react'
import { forwardRef, type ComponentProps, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Block } from '../../shared/types'
import { Timeline } from './Timeline'

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

  const MockVirtuoso = forwardRef<HTMLDivElement, MockVirtuosoProps>(function MockVirtuoso(props) {
    const { data, itemContent, components, rangeChanged } = props
    const Footer = components?.Footer

    rangeChanged?.({
      startIndex: 0,
      endIndex: Math.max(0, data.length - 1),
    })

    return (
      <div data-testid="mock-virtuoso">
        {data.map((item, index) => itemContent(index, item))}
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

describe('Timeline', () => {
  it('renders the mini timeline when enabled', () => {
    renderTimeline(true)

    expect(screen.getByTestId('mini-timeline')).toBeInTheDocument()
    expect(screen.getByText('03.31')).toBeInTheDocument()
  })

  it('does not render the mini timeline when disabled', () => {
    renderTimeline(false)

    expect(screen.queryByTestId('mini-timeline')).not.toBeInTheDocument()
  })
})
