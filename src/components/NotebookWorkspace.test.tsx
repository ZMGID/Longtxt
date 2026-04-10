import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SearchResult } from '../../shared/types'
import { NotebookWorkspace } from './NotebookWorkspace'

vi.mock('react-virtuoso', async () => {
  type MockVirtuosoProps<T> = {
    data: T[]
    itemContent: (index: number, item: T) => ReactNode
    style?: CSSProperties
  }

  const MockVirtuoso = forwardRef<HTMLDivElement, MockVirtuosoProps<unknown>>(function MockVirtuoso(props, ref) {
    return (
      <div ref={ref} data-testid="mock-virtuoso" style={props.style}>
        {props.data.map((item, index) => props.itemContent(index, item))}
      </div>
    )
  })

  return {
    Virtuoso: MockVirtuoso,
  }
})

vi.mock('./BlockCard', () => ({
  BlockCard: ({ block, headerActions }: { block: { content: string }; headerActions?: ReactNode }) => (
    <div>
      <div>{block.content}</div>
      {headerActions}
    </div>
  ),
}))

vi.mock('./InputBar', () => ({
  InputBar: ({ onSubmit, submitLabel }: { onSubmit: (content: string) => void; submitLabel?: string }) => (
    <button type="button" onClick={() => onSubmit('新建块')}>
      {submitLabel ?? '提交'}
    </button>
  ),
}))

const notebooks = [
  {
    id: 'notebook-1',
    title: '产品整理',
    createdAt: '2026-03-31T09:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
    itemCount: 2,
    blockCount: 2,
    structureCount: 0,
  },
]

const secondNotebookSummary = {
  id: 'notebook-2',
  title: '发布计划',
  createdAt: '2026-03-30T09:00:00.000Z',
  updatedAt: '2026-03-30T10:00:00.000Z',
  itemCount: 1,
  blockCount: 0,
  structureCount: 1,
}

const selectedNotebook = {
  id: 'notebook-1',
  title: '产品整理',
  createdAt: '2026-03-31T09:00:00.000Z',
  updatedAt: '2026-03-31T10:00:00.000Z',
  itemCount: 3,
  blockCount: 1,
  structureCount: 2,
  items: [
    {
      id: 'item-1',
      type: 'block' as const,
      sortOrder: 0,
      blockId: 'block-1',
      createdAt: '2026-03-31T09:00:00.000Z',
      updatedAt: '2026-03-31T09:10:00.000Z',
      block: {
        id: 'block-1',
        content: '已经收录的引用块',
        tags: [],
        createdAt: '2026-03-31T09:00:00.000Z',
        updatedAt: '2026-03-31T09:10:00.000Z',
        status: 'ready' as const,
        aiMode: 'live' as const,
      },
    },
    {
      id: 'item-2',
      type: 'heading' as const,
      sortOrder: 1,
      createdAt: '2026-03-31T09:10:00.000Z',
      updatedAt: '2026-03-31T09:10:00.000Z',
      content: '整理标题',
    },
    {
      id: 'item-3',
      type: 'todo' as const,
      sortOrder: 2,
      createdAt: '2026-03-31T09:20:00.000Z',
      updatedAt: '2026-03-31T09:20:00.000Z',
      content: '补一条待办',
      checked: false,
    },
  ],
}

const secondSelectedNotebook = {
  id: 'notebook-2',
  title: '发布计划',
  createdAt: '2026-03-30T09:00:00.000Z',
  updatedAt: '2026-03-30T10:00:00.000Z',
  itemCount: 1,
  blockCount: 0,
  structureCount: 1,
  items: [
    {
      id: 'item-4',
      type: 'note' as const,
      sortOrder: 0,
      createdAt: '2026-03-30T09:10:00.000Z',
      updatedAt: '2026-03-30T09:10:00.000Z',
      content: '新的整理备注',
    },
  ],
}

const searchResults: SearchResult[] = [
  {
    block: {
      id: 'block-1',
      content: '已经收录的引用块',
      tags: [],
      createdAt: '2026-03-31T09:00:00.000Z',
      updatedAt: '2026-03-31T09:10:00.000Z',
      status: 'ready',
      aiMode: 'live',
    },
    score: 0.91,
    matchSource: ['fts'],
  },
  {
    block: {
      id: 'block-2',
      content: '检索到的新引用块',
      tags: [
        {
          id: 'tag-1',
          name: '需求',
          isDefault: false,
          source: 'manual' as const,
          kind: 'user' as const,
        },
      ],
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T08:30:00.000Z',
      status: 'ready',
      aiMode: 'live',
    },
    score: 0.87,
    matchSource: ['vector'],
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

function renderWorkspace(
  {
    width = 1600,
    openSearch = false,
    overrides = {},
  }: {
    width?: number
    openSearch?: boolean
    overrides?: Record<string, unknown>
  } = {},
) {
  setWindowSize(width)

  const props = {
    notebooks,
    selectedNotebookId: 'notebook-1',
    selectedNotebook,
    loading: false,
    loadingNotebook: false,
    searching: false,
    searchQuery: '需求',
    searchResults,
    searchError: null,
    error: null,
    tagSuggestions: [],
    onSelectNotebook: vi.fn(),
    onCreateNotebook: vi.fn(async () => {}),
    onUpdateNotebookTitle: vi.fn(async () => {}),
    onDeleteNotebook: vi.fn(async () => {}),
    onCreateBlockInNotebook: vi.fn(async () => {}),
    onCreateNotebookStructureItem: vi.fn(async () => {}),
    onUpdateNotebookStructureItem: vi.fn(async () => {}),
    onUpdateBlock: vi.fn(async () => {}),
    onAddTag: vi.fn(async () => {}),
    onRemoveTag: vi.fn(async () => {}),
    onTagClick: vi.fn(),
    onRemoveNotebookItem: vi.fn(async () => {}),
    onReorderNotebookItems: vi.fn(async () => {}),
    onSearchQueryChange: vi.fn(),
    onSearch: vi.fn(async () => {}),
    onAddSearchResultToNotebook: vi.fn(async () => {}),
    ...overrides,
  }

  const renderResult = render(<NotebookWorkspace {...props} />)

  if (openSearch) {
    fireEvent.click(screen.getByTestId('notebook-search-toggle'))
  }

  return { props, ...renderResult }
}

describe('NotebookWorkspace', () => {
  it('uses a docked notebook list, keeps search collapsed by default, and removes old workbench panels', async () => {
    renderWorkspace({ width: 1600 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'two-pane')
    })
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'docked')
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'collapsed')
    expect(screen.getByTestId('notebook-list-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('notebook-search-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('结构块')).not.toBeInTheDocument()
    expect(screen.queryByText('生成文档')).not.toBeInTheDocument()
    expect(screen.queryByText('引用审核')).not.toBeInTheDocument()
    expect(screen.queryByText('快照历史')).not.toBeInTheDocument()
    expect(screen.queryByText('Notebook List')).not.toBeInTheDocument()
    expect(screen.queryByText('当前笔记本')).not.toBeInTheDocument()
  })

  it('moves search, create, and delete actions into the notebook list on large screens', async () => {
    renderWorkspace({ width: 1600 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'two-pane')
    })

    const listPanel = screen.getByTestId('notebook-list-panel')
    expect(within(listPanel).getByRole('button', { name: '检索块' })).toBeInTheDocument()
    expect(within(listPanel).getByRole('button', { name: '新建笔记本' })).toBeInTheDocument()
    expect(within(listPanel).getByRole('button', { name: '删除笔记本' })).toBeInTheDocument()
    expect(within(listPanel).queryByText('Notebook List')).not.toBeInTheDocument()
    expect(within(listPanel).queryByText('当前笔记本')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })

  it('switches the left sidebar into search mode on demand and shows retrieval sources', async () => {
    renderWorkspace({ width: 1600, openSearch: true })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'docked')
    })
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'collapsed')
    expect(screen.queryByTestId('notebook-list-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('notebook-search-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('mock-virtuoso').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '返回笔记本' })).toBeInTheDocument()
    expect(screen.getByText('全文命中')).toBeInTheDocument()
    expect(screen.getByText('向量命中')).toBeInTheDocument()
  })

  it('keeps the notebook layout in two panes for medium desktop widths', async () => {
    renderWorkspace({ width: 1000 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'two-pane')
    })
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'docked')
    expect(screen.queryByText('展开笔记本')).not.toBeInTheDocument()
    expect(screen.queryByText('展开检索栏')).not.toBeInTheDocument()
  })

  it('keeps auxiliary toggle buttons hidden in single-pane mode', async () => {
    renderWorkspace({ width: 900 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'single-pane')
    })
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'collapsed')
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'collapsed')
    expect(screen.getByTestId('notebook-mobile-toolbar')).toBeInTheDocument()
    expect(screen.queryByTestId('notebook-list-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notebook-search-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('展开笔记本')).not.toBeInTheDocument()
    expect(screen.queryByText('展开检索栏')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('restores notebook list and search access in single-pane mode', async () => {
    const view = renderWorkspace({ width: 900 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'single-pane')
    })

    fireEvent.click(screen.getByRole('button', { name: '笔记本' }))
    expect(screen.getByTestId('notebook-mobile-panel')).toBeInTheDocument()
    expect(screen.getByTestId('notebook-list-panel')).toBeInTheDocument()

    fireEvent.click(within(screen.getByTestId('notebook-list-panel')).getByRole('button', { name: /产品整理/ }))
    expect(view.props.onSelectNotebook).toHaveBeenCalledWith('notebook-1')
    await waitFor(() => {
      expect(screen.queryByTestId('notebook-mobile-panel')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '检索' }))
    expect(screen.getByTestId('notebook-search-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回笔记本' }))
    expect(screen.getByTestId('notebook-list-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '检索' }))
    fireEvent.click(screen.getByRole('button', { name: '加入当前笔记本' }))
    await waitFor(() => {
      expect(view.props.onAddSearchResultToNotebook).toHaveBeenCalledWith('block-2')
    })
  })

  it('resets notebook deletion confirmation after switching away and back', async () => {
    const view = renderWorkspace({
      width: 1600,
      overrides: {
        notebooks: [notebooks[0], secondNotebookSummary],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '删除笔记本' }))
    expect(screen.getByRole('button', { name: '确认删除?' })).toBeInTheDocument()

    view.rerender(
      <NotebookWorkspace
        {...view.props}
        notebooks={[notebooks[0], secondNotebookSummary]}
        selectedNotebookId="notebook-2"
        selectedNotebook={secondSelectedNotebook}
      />,
    )

    view.rerender(
      <NotebookWorkspace
        {...view.props}
        notebooks={[notebooks[0], secondNotebookSummary]}
        selectedNotebookId="notebook-1"
        selectedNotebook={selectedNotebook}
      />,
    )

    expect(screen.getByRole('button', { name: '删除笔记本' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认删除?' })).not.toBeInTheDocument()
  })

  it('marks existing notebook blocks and adds new search results to the current notebook', async () => {
    const view = renderWorkspace({ width: 1600, openSearch: true })

    expect(screen.getByRole('button', { name: '已加入当前笔记本' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '加入当前笔记本' }))

    await waitFor(() => {
      expect(view.props.onAddSearchResultToNotebook).toHaveBeenCalledWith('block-2')
    })
  })

  it('shows structured notebook items and restores structure creation behind a compact toggle', async () => {
    const view = renderWorkspace({ width: 1600 })

    expect(screen.getByText('整理标题')).toBeInTheDocument()
    expect(screen.getByText('补一条待办')).toBeInTheDocument()
    expect(screen.getAllByText((content) => content.includes('3 项内容')).length).toBeGreaterThan(0)
    expect(screen.getAllByText((content) => content.includes('1 个引用块')).length).toBeGreaterThan(0)
    expect(screen.getAllByText((content) => content.includes('2 个结构项')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '标题' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '分隔' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '笔记' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '待办' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '结构项' }))
    fireEvent.click(screen.getByRole('button', { name: '标题' }))

    await waitFor(() => {
      expect(view.props.onCreateNotebookStructureItem).toHaveBeenCalledWith('notebook-1', { type: 'heading' })
    })
  })

  it('renders notebook items in reverse order and keeps the body scrollable', () => {
    renderWorkspace({ width: 1600 })

    const todo = screen.getByText('补一条待办')
    const heading = screen.getByText('整理标题')
    const block = screen.getByText('已经收录的引用块')
    const scrollContainer = screen.getByTestId('notebook-items-scroll')
    const rowNumbers = screen.getAllByText(/^(03|02|01)$/).map((node) => node.textContent)

    expect(todo.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rowNumbers.slice(0, 3)).toEqual(['03', '02', '01'])
    expect(scrollContainer.className).toContain('overflow-y-auto')
    expect(scrollContainer.className).toContain('h-full')
  })

  it('keeps item controls in a compact side column on small widths', async () => {
    renderWorkspace({ width: 900 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'single-pane')
    })

    const firstRow = screen.getByTestId('notebook-item-row-item-3')
    expect(firstRow.className).toContain('grid-cols-[30px_minmax(0,1fr)]')
    expect(firstRow.className).toContain('gap-2.5')
  })

  it('uses tag click for secondary search from the notebook search panel', () => {
    const view = renderWorkspace({ width: 1600, openSearch: true })

    fireEvent.click(screen.getByRole('button', { name: '需求' }))

    expect(view.props.onTagClick).toHaveBeenCalledWith('需求')
  })
})
