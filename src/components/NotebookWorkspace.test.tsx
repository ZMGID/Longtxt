import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SearchResult } from '../../shared/types'
import { NotebookWorkspace } from './NotebookWorkspace'

vi.mock('./BlockCard', () => ({
  BlockCard: ({ block, headerActions }: { block: { content: string }; headerActions?: React.ReactNode }) => (
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
  itemCount: 1,
  blockCount: 1,
  structureCount: 0,
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

function renderWorkspace() {
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
  fireEvent.click(screen.getByRole('button', { name: '展开检索栏' }))

  return props
}

describe('NotebookWorkspace', () => {
  it('hides structure block entry and notebook workbench panels', () => {
    renderWorkspace()

    expect(screen.queryByText('结构块')).not.toBeInTheDocument()
    expect(screen.queryByText('生成文档')).not.toBeInTheDocument()
    expect(screen.queryByText('引用审核')).not.toBeInTheDocument()
    expect(screen.queryByText('快照历史')).not.toBeInTheDocument()
    expect(screen.getByText('检索补料')).toBeInTheDocument()
  })

  it('shows retrieval sources in notebook sidebar search results', () => {
    renderWorkspace()

    expect(screen.getByText('全文命中')).toBeInTheDocument()
    expect(screen.getByText('向量命中')).toBeInTheDocument()
  })

  it('marks existing notebook blocks and adds new search results to the current notebook', async () => {
    const props = renderWorkspace()

    expect(screen.getByRole('button', { name: '已加入当前笔记本' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '加入当前笔记本' }))

    await waitFor(() => {
      expect(props.onAddSearchResultToNotebook).toHaveBeenCalledWith('block-2')
    })
  })

  it('uses tag click for secondary search from the notebook sidebar', () => {
    const props = renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: '需求' }))

    expect(props.onTagClick).toHaveBeenCalledWith('需求')
  })
})
