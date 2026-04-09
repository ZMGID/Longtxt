import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { SnapshotsView } from './SnapshotsView'
import { ToastContext } from './toast-context'

vi.mock('./MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <div data-testid="snapshot-markdown">{content}</div>,
}))

const clipboardWriteText = vi.fn(async () => {})

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
}

function renderSnapshots(
  overrides: Partial<ComponentProps<typeof SnapshotsView>> = {},
  options: { width?: number } = {},
) {
  const toast = vi.fn()

  setViewportWidth(options.width ?? 1440)

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
        updatedAt: '2026-04-01T08:00:00.000Z',
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
        updatedAt: '2026-04-03T10:45:00.000Z',
      },
    ],
    selectedSnapshotId: 'snapshot-1',
    snapshotQuery: '',
    importPreview: null,
    onSnapshotQueryChange: vi.fn(),
    onSelectSnapshot: vi.fn(),
    onUpdateSnapshot: vi.fn(async () => {}),
    onRemoveSnapshot: vi.fn(async () => {}),
    onExportMarkdown: vi.fn(async () => {}),
    onExportJson: vi.fn(async () => {}),
    onPreviewMarkdownImport: vi.fn(async () => {}),
    onPreviewJsonImport: vi.fn(async () => {}),
    onConfirmImport: vi.fn(async () => {}),
    onDismissImportPreview: vi.fn(),
    ...overrides,
  }

  const renderResult = render(
    <ToastContext.Provider value={{ toast }}>
      <SnapshotsView {...props} />
    </ToastContext.Provider>,
  )

  return {
    props,
    toast,
    ...renderResult,
  }
}

beforeEach(() => {
  clipboardWriteText.mockClear()
  setViewportWidth(1440)
})

describe('SnapshotsView', () => {
  it('renders the new search + reading layout and forwards search plus selection actions', () => {
    const { props } = renderSnapshots()

    expect(screen.getByTestId('snapshots-layout')).toBeInTheDocument()
    expect(screen.getByTestId('snapshots-browser-pane')).toBeInTheDocument()
    expect(screen.getByTestId('snapshots-reading-pane')).toBeInTheDocument()
    expect(screen.getByTestId('snapshots-search-bar')).toBeInTheDocument()
    expect(screen.getByTestId('snapshots-reading-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-markdown')).toHaveTextContent('这里是第一版文档内容。')
    expect(screen.queryByRole('heading', { name: '项目回顾' })).not.toBeInTheDocument()
    expect(screen.queryByText('阅读')).not.toBeInTheDocument()
    expect(screen.queryByText('文档快照')).not.toBeInTheDocument()
    expect(screen.queryByText('检索快照')).not.toBeInTheDocument()
    expect(screen.queryByText('搜主题和正文，列表只保留定位信息，把空间留给正文阅读。')).not.toBeInTheDocument()

    expect(screen.queryByTestId('snapshots-tag-filter-section')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('起始日期')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('结束日期')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '路线图' } })
    expect(props.onSnapshotQueryChange).toHaveBeenCalledWith('路线图')

    fireEvent.click(screen.getByTestId('snapshot-row-snapshot-2'))
    expect(props.onSelectSnapshot).toHaveBeenCalledWith('snapshot-2')
  })

  it('keeps import/export in a secondary tool area and exports without tag/date filters', () => {
    const { props } = renderSnapshots()

    expect(screen.queryByRole('button', { name: '导出 Markdown' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('snapshots-tools-toggle'))

    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 JSON' }))

    expect(props.onExportMarkdown).toHaveBeenCalledWith({
      includeAttachments: true,
    })
    expect(props.onExportJson).toHaveBeenCalledWith({
      includeAttachments: true,
    })
    expect(props.onPreviewMarkdownImport).toHaveBeenCalledTimes(1)
    expect(props.onPreviewJsonImport).toHaveBeenCalledTimes(1)
  })

  it('does not render snapshot tags in the list or reading header anymore', () => {
    renderSnapshots()

    expect(screen.queryByText('需求')).not.toBeInTheDocument()
    expect(screen.queryByText('技术')).not.toBeInTheDocument()
    expect(screen.queryByText(/^标签$/)).not.toBeInTheDocument()
  })

  it('supports editing topic and content in place', async () => {
    const { props } = renderSnapshots()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByPlaceholderText('输入快照主题'), { target: { value: '项目回顾（修订）' } })
    fireEvent.change(screen.getByPlaceholderText('输入快照正文，支持 Markdown。'), { target: { value: '# 项目回顾（修订）\n\n更新后的正文。' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(props.onUpdateSnapshot).toHaveBeenCalledWith('snapshot-1', {
        topic: '项目回顾（修订）',
        content: '# 项目回顾（修订）\n\n更新后的正文。',
      })
    })
  })

  it('cancels editing and resets drafts when selection changes', () => {
    const { props, rerender, toast } = renderSnapshots()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByPlaceholderText('输入快照主题'), { target: { value: '临时草稿主题' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(props.onUpdateSnapshot).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('临时草稿主题')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByPlaceholderText('输入快照主题'), { target: { value: '另一个临时草稿' } })

    rerender(
      <ToastContext.Provider value={{ toast }}>
        <SnapshotsView
          {...props}
          selectedSnapshotId="snapshot-2"
        />
      </ToastContext.Provider>,
    )

    expect(screen.queryByDisplayValue('另一个临时草稿')).not.toBeInTheDocument()
    expect(screen.getByTestId('snapshot-markdown')).toHaveTextContent('路线图整理')
  })

  it('shows edited metadata plus reference info in the reading pane', () => {
    renderSnapshots({
      selectedSnapshotId: 'snapshot-2',
    })

    expect(screen.queryByText('正文优先展示；引用信息只保留必要上下文。')).not.toBeInTheDocument()

    const referenceSection = screen.getByTestId('snapshots-reference-section')
    expect(within(referenceSection).getByText('最近更新')).toBeInTheDocument()
    expect(within(referenceSection).getByText('来源笔记本')).toBeInTheDocument()
    expect(within(referenceSection).getByText('引用块')).toBeInTheDocument()
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

  it('switches between result list and reading pane in compact mode', () => {
    renderSnapshots({}, { width: 900 })

    expect(screen.getByTestId('snapshots-compact-switcher')).toBeInTheDocument()
    expect(screen.queryByTestId('snapshots-browser-pane')).not.toBeInTheDocument()
    expect(screen.getByTestId('snapshots-reading-pane')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(screen.getByTestId('snapshots-browser-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('snapshots-reading-pane')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('snapshot-row-snapshot-2'))
    expect(screen.getByTestId('snapshots-reading-pane')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回结果' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回结果' }))
    expect(screen.getByTestId('snapshots-browser-pane')).toBeInTheDocument()
  })
})
