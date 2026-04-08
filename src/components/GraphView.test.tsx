import type { ComponentProps } from 'react'
import { forwardRef, useImperativeHandle } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Block, GraphEdge, GraphNode, TagSuggestion } from '../../shared/types'
import { GraphView } from './GraphView'

const graphMethodMocks = vi.hoisted(() => ({
  chargeStrength: vi.fn(),
  linkDistance: vi.fn(),
  zoomToFit: vi.fn(),
}))

vi.mock('react-force-graph-2d', () => ({
  default: forwardRef(function ForceGraphMock(props: { width: number, height: number }, ref) {
    useImperativeHandle(ref, () => ({
      d3Force: (name: string) => {
        if (name === 'charge') {
          return { strength: graphMethodMocks.chargeStrength }
        }

        if (name === 'link') {
          return { distance: graphMethodMocks.linkDistance }
        }

        return null
      },
      zoomToFit: graphMethodMocks.zoomToFit,
    }))

    return <div data-testid="force-graph" data-width={props.width} data-height={props.height} />
  }),
}))

const nodes: GraphNode[] = [
  {
    id: 'block-1',
    label: '项目复盘',
    summary: '项目复盘摘要',
    tags: ['项目', '复盘', '协作'],
    color: '#b45309',
    size: 8,
  },
  {
    id: 'block-2',
    label: '会议纪要',
    summary: '会议纪要摘要',
    tags: ['项目', '会议'],
    color: '#92400e',
    size: 7,
  },
]

const edges: GraphEdge[] = [
  {
    source: 'block-1',
    target: 'block-2',
    weight: 2,
    sharedTags: ['项目'],
  },
]

const availableTags: TagSuggestion[] = [
  { id: 'tag-1', name: '项目', isDefault: false, kind: 'user' },
  { id: 'tag-2', name: '会议', isDefault: false, kind: 'detail' },
  { id: 'tag-3', name: '复盘', isDefault: false, kind: 'detail' },
]

const selectedBlock: Block = {
  id: 'block-1',
  content: '这里是当前块的正文内容，用于验证详情侧栏是否放大并可阅读。',
  summary: '项目复盘摘要',
  tags: [
    { id: 'tag-1', name: '项目', isDefault: false, source: 'manual', kind: 'user' },
    { id: 'tag-3', name: '复盘', isDefault: false, source: 'manual', kind: 'detail' },
  ],
  createdAt: '2026-04-07T03:00:00.000Z',
  updatedAt: '2026-04-07T03:30:00.000Z',
  status: 'ready',
  aiMode: 'live',
  errorMessage: null,
}

function renderGraph(overrides: Partial<ComponentProps<typeof GraphView>> = {}) {
  const props: ComponentProps<typeof GraphView> = {
    nodes,
    edges,
    loading: false,
    selectedBlockId: selectedBlock.id,
    selectedBlock,
    availableTags,
    activeTagFilters: ['项目'],
    onToggleTagFilter: vi.fn(),
    onClearFilters: vi.fn(),
    onSelectNode: vi.fn(),
    onJumpToBlock: vi.fn(),
    ...overrides,
  }

  render(<GraphView {...props} />)
  return props
}

describe('GraphView', () => {
  beforeEach(() => {
    graphMethodMocks.chargeStrength.mockReset()
    graphMethodMocks.linkDistance.mockReset()
    graphMethodMocks.zoomToFit.mockReset()

    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe(): void {
        this.callback(
          [
            {
              contentRect: {
                width: 720,
                height: 540,
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
  })

  it('renders merged sidebar with filters and enlarged block detail actions', () => {
    const props = renderGraph()

    expect(screen.getByText('筛选与块详情')).toBeInTheDocument()
    expect(screen.getByText('标签筛选')).toBeInTheDocument()
    expect(screen.getByText('块详情')).toBeInTheDocument()
    expect(screen.getAllByText('项目复盘摘要').length).toBeGreaterThan(0)
    expect(screen.getByText('这里是当前块的正文内容，用于验证详情侧栏是否放大并可阅读。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }))
    expect(props.onClearFilters).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '回到时间轴' }))
    expect(props.onJumpToBlock).toHaveBeenCalledWith('block-1')

    fireEvent.click(screen.getAllByRole('button', { name: '项目' })[0])
    expect(props.onToggleTagFilter).toHaveBeenCalledWith('项目')
  })

  it('shows loading state for detail sidebar when selection exists but block is still fetching', () => {
    renderGraph({ selectedBlockId: 'block-2', selectedBlock: null })

    expect(screen.getByText('正在加载块详情…')).toBeInTheDocument()
  })

  it('shows empty graph state when no nodes are available', () => {
    renderGraph({ nodes: [], edges: [], activeTagFilters: [] })

    expect(screen.getByText('当前筛选下没有可显示的块关联。试试清空标签筛选，或先积累更多带标签的块。')).toBeInTheDocument()
  })

  it('shows graph loading state while building network', () => {
    renderGraph({ loading: true, nodes: [], edges: [], selectedBlockId: null, selectedBlock: null, activeTagFilters: [] })

    expect(screen.getByText('正在构建连接图…')).toBeInTheDocument()
  })
})
