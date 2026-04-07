import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { SnapshotsView } from './SnapshotsView'
import { ToastContext } from './toast-context'

vi.mock('./MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <div data-testid="snapshot-markdown">{content}</div>,
}))

const clipboardWriteText = vi.fn(async () => {})

function renderSnapshots(overrides: Partial<ComponentProps<typeof SnapshotsView>> = {}) {
  const toast = vi.fn()

  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: clipboardWriteText,
    },
  })

  const props: ComponentProps<typeof SnapshotsView> = {
    snapshots: [
      {
        id: 'snapshot-1',
        topic: '项目回顾',
        content: '# 项目回顾\n\n这里是第一版文档内容。',
        blockIds: ['block-1', 'block-2'],
        tags: [
          { id: 'tag-1', name: '需求', isDefault: false, kind: 'user', source: 'manual' },
          { id: 'tag-2', name: '技术', isDefault: true, kind: 'category', source: 'auto' },
        ],
        notebookId: 'notebook-1',
        notebookTitle: '产品笔记',
        createdAt: '2026-04-01T08:00:00.000Z',
      },
      {
        id: 'snapshot-2',
        topic: '路线图整理',
        content: '# 路线图整理\n\n这里是第二版文档内容。',
        blockIds: ['block-3'],
        tags: [
          { id: 'tag-1', name: '需求', isDefault: false, kind: 'user', source: 'manual' },
          { id: 'tag-3', name: '规划', isDefault: false, kind: 'detail', source: 'auto' },
        ],
        notebookId: 'notebook-2',
        notebookTitle: '路线规划',
        createdAt: '2026-04-02T09:30:00.000Z',
      },
    ],
    selectedSnapshotId: 'snapshot-1',
    snapshotQuery: '',
    importPreview: null,
    onSnapshotQueryChange: vi.fn(),
    onSelectSnapshot: vi.fn(),
    onRemoveSnapshot: vi.fn(async () => {}),
    onExportMarkdown: vi.fn(async () => {}),
    onExportJson: vi.fn(async () => {}),
    onPreviewMarkdownImport: vi.fn(async () => {}),
    onPreviewJsonImport: vi.fn(async () => {}),
    onConfirmImport: vi.fn(async () => {}),
    onDismissImportPreview: vi.fn(),
    ...overrides,
  }

  render(
    <ToastContext.Provider value={{ toast }}>
      <SnapshotsView {...props} />
    </ToastContext.Provider>,
  )

  return {
    props,
    toast,
  }
}

beforeEach(() => {
  clipboardWriteText.mockClear()
})

describe('SnapshotsView', () => {
  it('uses a flat two-pane layout and forwards search plus selection actions', () => {
    const { props } = renderSnapshots()

    expect(screen.getByTestId('snapshots-layout')).toBeInTheDocument()
    expect(screen.getByText('浏览与切换')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-row-snapshot-1')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-markdown')).toHaveTextContent('这里是第一版文档内容。')
    expect(screen.getByTestId('snapshots-tag-filter-section')).toBeInTheDocument()
    expect(screen.getByText('标签')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '路线图' } })
    expect(props.onSnapshotQueryChange).toHaveBeenCalledWith('路线图')

    fireEvent.click(screen.getByTestId('snapshot-row-snapshot-2'))
    expect(props.onSelectSnapshot).toHaveBeenCalledWith('snapshot-2')
  })

  it('passes current tag and date filters to export actions and triggers imports', () => {
    const { props } = renderSnapshots()
    const tagFilterSection = screen.getByTestId('snapshots-tag-filter-section')

    fireEvent.click(within(tagFilterSection).getByRole('button', { name: /需求/ }))
    fireEvent.change(screen.getByLabelText('起始日期'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-04-30' } })

    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 JSON' }))

    expect(props.onExportMarkdown).toHaveBeenCalledWith({
      includeAttachments: true,
      tagFilter: ['需求'],
      dateRange: {
        start: '2026-04-01',
        end: '2026-04-30',
      },
    })
    expect(props.onExportJson).toHaveBeenCalledWith({
      includeAttachments: true,
      tagFilter: ['需求'],
      dateRange: {
        start: '2026-04-01',
        end: '2026-04-30',
      },
    })
    expect(props.onPreviewMarkdownImport).toHaveBeenCalledTimes(1)
    expect(props.onPreviewJsonImport).toHaveBeenCalledTimes(1)
  })

  it('uses snapshot-derived tags instead of unrelated default tag templates', () => {
    renderSnapshots({
      snapshots: [
        {
          id: 'snapshot-1',
          topic: '项目回顾',
          content: '内容',
          blockIds: ['block-1'],
          tags: [
            { id: 'tag-user', name: '人工标签', isDefault: false, kind: 'user', source: 'manual' },
            { id: 'tag-category', name: '工作', isDefault: true, kind: 'category', source: 'auto' },
            { id: 'tag-meta', name: 'TODO', isDefault: true, kind: 'detail', source: 'auto' },
          ],
          createdAt: '2026-04-01T08:00:00.000Z',
        },
      ],
      selectedSnapshotId: 'snapshot-1',
    })

    const tagFilterSection = screen.getByTestId('snapshots-tag-filter-section')

    expect(within(tagFilterSection).getByRole('button', { name: /人工标签/ })).toBeInTheDocument()
    expect(within(tagFilterSection).getByRole('button', { name: /工作/ })).toBeInTheDocument()
    expect(within(tagFilterSection).queryByRole('button', { name: /TODO/ })).not.toBeInTheDocument()
  })

  it('shows snapshot tags in the reading header', () => {
    renderSnapshots()

    expect(screen.getAllByText('需求').length).toBeGreaterThan(0)
    expect(screen.getAllByText('技术').length).toBeGreaterThan(0)
  })

  it('shows import preview actions and supports copy plus delete', async () => {
    const { props, toast } = renderSnapshots({
      importPreview: {
        importId: 'import-1',
        format: 'markdown',
        totalFiles: 2,
        totalBlocks: 18,
        conflicts: 1,
        samples: [
          {
            filename: 'weekly-note.md',
            preview: '本周总结',
          },
        ],
      },
    })

    expect(screen.getByTestId('snapshots-import-preview')).toBeInTheDocument()
    expect(screen.getByText(/weekly-note.md：本周总结/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '复制全文' }))
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('# 项目回顾\n\n这里是第一版文档内容。')
    })
    expect(toast).toHaveBeenCalledWith('success', '已复制到剪贴板。')

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(props.onRemoveSnapshot).toHaveBeenCalledWith('snapshot-1')

    fireEvent.click(screen.getByRole('button', { name: '全部跳过冲突' }))
    fireEvent.click(screen.getByRole('button', { name: '全部覆盖冲突' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(props.onConfirmImport).toHaveBeenCalledWith('skip_all')
    expect(props.onConfirmImport).toHaveBeenCalledWith('overwrite_all')
    expect(props.onDismissImportPreview).toHaveBeenCalledTimes(1)
  })

  it('renders an empty state when no snapshots are available', () => {
    renderSnapshots({
      snapshots: [],
      selectedSnapshotId: null,
      snapshotQuery: '',
    })

    expect(screen.getByText('还没有文档快照')).toBeInTheDocument()
    expect(screen.getByText(/先在搜索生成页生成一篇文档/)).toBeInTheDocument()
  })
})
