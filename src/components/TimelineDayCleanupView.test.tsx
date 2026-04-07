import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Block, BlockBatchRemoveResult } from '../../shared/types'
import { TimelineDayCleanupView } from './TimelineDayCleanupView'
import { ToastContext } from './toast-context'

const mocks = vi.hoisted(() => ({
  useBlocksByDate: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('../hooks/useBlocksByDate', () => ({
  useBlocksByDate: mocks.useBlocksByDate,
}))

const sampleBlocks: Block[] = [
  {
    id: 'block-1',
    content: '第一条要删除的内容',
    tags: [],
    createdAt: '2026-04-06T09:00:00.000Z',
    updatedAt: '2026-04-06T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-2',
    content: '第二条要保留观察的内容',
    tags: [{ id: 'tag-1', name: '整理', isDefault: false, source: 'manual', kind: 'user' }],
    createdAt: '2026-04-06T11:00:00.000Z',
    updatedAt: '2026-04-06T11:00:00.000Z',
    status: 'pending',
    aiMode: 'mock',
  },
]

function renderView(overrides: {
  blocks?: Block[]
  onDeleteBlocks?: (ids: string[]) => Promise<BlockBatchRemoveResult>
  onBack?: () => void
} = {}) {
  const toast = vi.fn()
  const onDeleteBlocks = overrides.onDeleteBlocks ?? vi.fn(async (ids: string[]) => ({ removed: ids.length, removedIds: ids }))
  const onBack = overrides.onBack ?? vi.fn()

  mocks.useBlocksByDate.mockReturnValue({
    data: overrides.blocks ?? sampleBlocks,
    isPending: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  })

  render(
    <ToastContext.Provider value={{ toast }}>
      <TimelineDayCleanupView date="2026-04-06" onBack={onBack} onDeleteBlocks={onDeleteBlocks} />
    </ToastContext.Provider>,
  )

  return {
    toast,
    onDeleteBlocks,
    onBack,
  }
}

beforeEach(() => {
  mocks.useBlocksByDate.mockReset()
  mocks.refetch.mockReset()
  mocks.refetch.mockResolvedValue(undefined)
})

describe('TimelineDayCleanupView', () => {
  it('renders the selected day and block list', () => {
    renderView()

    expect(screen.getByTestId('timeline-day-cleanup-view')).toBeInTheDocument()
    expect(screen.getByText(/2026年4月6日/)).toBeInTheDocument()
    expect(screen.getByText('第一条要删除的内容')).toBeInTheDocument()
    expect(screen.getByText('第二条要保留观察的内容')).toBeInTheDocument()
    expect(screen.getByText(/当天共/)).toBeInTheDocument()
  })

  it('supports select all and batch delete with confirmation', async () => {
    const { onDeleteBlocks, toast } = renderView()

    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/删除后不可恢复/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(onDeleteBlocks).toHaveBeenCalledWith(['block-1', 'block-2'])
    })

    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('success', '已删除 2 条内容。')
  })

  it('returns to timeline when back button is clicked', () => {
    const { onBack } = renderView()

    fireEvent.click(screen.getByRole('button', { name: '返回时间线' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
