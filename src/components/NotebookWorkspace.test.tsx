import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SearchResult } from '../../shared/types'
import { NotebookWorkspace } from './NotebookWorkspace'

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

function renderWorkspace({ width = 1600, openSearch = false }: { width?: number; openSearch?: boolean } = {}) {
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
  }

  render(<NotebookWorkspace {...props} />)

  if (openSearch) {
    fireEvent.click(screen.getByTestId('notebook-search-toggle'))
  }

  return props
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
  })

  it('opens the search panel on demand and shows retrieval sources', async () => {
    renderWorkspace({ width: 1600, openSearch: true })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'docked')
    })
    expect(screen.getByText('检索补料')).toBeInTheDocument()
    expect(screen.getByText('全文命中')).toBeInTheDocument()
    expect(screen.getByText('向量命中')).toBeInTheDocument()
  })

  it('collapses auxiliary panels in single-pane mode and reveals them through toggles', async () => {
    renderWorkspace({ width: 900 })

    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-layout', 'single-pane')
    })
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'collapsed')
    expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'collapsed')
    expect(screen.queryByTestId('notebook-list-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notebook-search-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('notebook-list-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-list-mode', 'inline')
    })
    expect(screen.getByTestId('notebook-list-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('notebook-search-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('notebook-layout')).toHaveAttribute('data-search-mode', 'inline')
    })
    expect(screen.queryByTestId('notebook-list-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('notebook-search-panel')).toBeInTheDocument()
  })

  it('marks existing notebook blocks and adds new search results to the current notebook', async () => {
    const props = renderWorkspace({ width: 1600, openSearch: true })

    expect(screen.getByRole('button', { name: '已加入当前笔记本' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '加入当前笔记本' }))

    await waitFor(() => {
      expect(props.onAddSearchResultToNotebook).toHaveBeenCalledWith('block-2')
    })
  })

  it('shows structured notebook items and lets users create more structure items', async () => {
    const props = renderWorkspace({ width: 1600 })

    expect(screen.getByText('整理标题')).toBeInTheDocument()
    expect(screen.getByText('补一条待办')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('3 项内容'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('1 个引用块'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('2 个结构项'))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新建标题' }))

    await waitFor(() => {
      expect(props.onCreateNotebookStructureItem).toHaveBeenCalledWith('notebook-1', 'heading')
    })
  })

  it('uses tag click for secondary search from the notebook search panel', () => {
    const props = renderWorkspace({ width: 1600, openSearch: true })

    fireEvent.click(screen.getByRole('button', { name: '需求' }))

    expect(props.onTagClick).toHaveBeenCalledWith('需求')
  })
})
