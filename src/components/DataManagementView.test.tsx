import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Block, DataManagementOverview, ImportPreview } from '../../shared/types'
import { DataManagementView } from './DataManagementView'
import { ToastContext } from './toast-context'

const mocks = vi.hoisted(() => ({
  useDataManagementOverview: vi.fn(),
  useBlockCleanupDays: vi.fn(),
  useBlocksByDate: vi.fn(),
  cleanupOrphanAttachments: vi.fn(),
  rebuildAttachmentIndex: vi.fn(),
  rebuildAllVectors: vi.fn(),
  removeMany: vi.fn(),
  retryFailed: vi.fn(),
  openDataDirectory: vi.fn(),
  openSettingsDirectory: vi.fn(),
  exportMarkdown: vi.fn(),
  exportJson: vi.fn(),
  previewMarkdown: vi.fn(),
  previewJson: vi.fn(),
  confirmImport: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('../hooks/useDataManagementOverview', () => ({
  useDataManagementOverview: mocks.useDataManagementOverview,
}))

vi.mock('../hooks/useBlockCleanupDays', () => ({
  useBlockCleanupDays: mocks.useBlockCleanupDays,
}))

vi.mock('../hooks/useBlocksByDate', () => ({
  useBlocksByDate: mocks.useBlocksByDate,
}))

vi.mock('../lib/changbu', () => ({
  changbu: {
    blocks: {
      removeMany: mocks.removeMany,
    },
    data: {
      cleanupOrphanAttachments: mocks.cleanupOrphanAttachments,
      rebuildAttachmentIndex: mocks.rebuildAttachmentIndex,
      rebuildAllVectors: mocks.rebuildAllVectors,
    },
    settings: {
      openDataDirectory: mocks.openDataDirectory,
      openSettingsDirectory: mocks.openSettingsDirectory,
    },
    exports: {
      markdown: mocks.exportMarkdown,
      json: mocks.exportJson,
    },
    imports: {
      previewMarkdown: mocks.previewMarkdown,
      previewJson: mocks.previewJson,
      confirm: mocks.confirmImport,
    },
    vectors: {
      retryFailed: mocks.retryFailed,
    },
  },
}))

const baseOverview: DataManagementOverview = {
  dataDirectory: '/tmp/changbu',
  databasePath: '/tmp/changbu/changbu.sqlite3',
  settingsDirectory: '/tmp/changbu/settings',
  settingsFilePath: '/tmp/changbu/settings/settings.json',
  totalBlockCount: 128,
  totalNotebookCount: 6,
  totalSnapshotCount: 12,
  totalAttachmentCount: 33,
  totalVectorCount: 126,
  vectorReady: true,
  aiConfigured: false,
  activeAiMode: 'mock',
  vectorDimension: 1024,
  vectorSchemaReady: true,
  failedVectorCount: 2,
  pendingVectorCount: 4,
  vectorQueueProcessing: true,
  tokenUsage: {
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200,
    requestCount: 3,
  },
}

const cleanupBlocks: Block[] = [
  {
    id: 'block-1',
    content: '这条内容需要清理',
    tags: [],
    createdAt: '2026-04-06T09:00:00.000Z',
    updatedAt: '2026-04-06T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-2',
    content: '这条内容也可以一起删掉',
    tags: [],
    createdAt: '2026-04-06T10:00:00.000Z',
    updatedAt: '2026-04-06T10:00:00.000Z',
    status: 'pending',
    aiMode: 'mock',
  },
]

function mockOverviewQuery(overview: DataManagementOverview = baseOverview) {
  mocks.useDataManagementOverview.mockReturnValue({
    data: overview,
    isPending: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  })
}

function mockCleanupQueries() {
  mocks.useBlockCleanupDays.mockReturnValue({
    data: [
      { date: '2026-04-06', blockCount: 2 },
      { date: '2026-04-05', blockCount: 1 },
    ],
    isPending: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  })

  mocks.useBlocksByDate.mockImplementation((date: string) => ({
    data: date === '2026-04-06' ? cleanupBlocks : [],
    isPending: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  }))
}

function renderView() {
  const toast = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={{ toast }}>
        <DataManagementView />
      </ToastContext.Provider>
    </QueryClientProvider>,
  )

  return { toast }
}

beforeEach(() => {
  mockOverviewQuery()
  mockCleanupQueries()
  mocks.cleanupOrphanAttachments.mockReset()
  mocks.rebuildAttachmentIndex.mockReset()
  mocks.rebuildAllVectors.mockReset()
  mocks.removeMany.mockReset()
  mocks.retryFailed.mockReset()
  mocks.openDataDirectory.mockReset()
  mocks.openSettingsDirectory.mockReset()
  mocks.exportMarkdown.mockReset()
  mocks.exportJson.mockReset()
  mocks.previewMarkdown.mockReset()
  mocks.previewJson.mockReset()
  mocks.confirmImport.mockReset()
  mocks.refetch.mockReset()

  mocks.cleanupOrphanAttachments.mockResolvedValue({ removedCount: 3 })
  mocks.rebuildAttachmentIndex.mockResolvedValue({
    indexedBlockCount: 128,
    attachmentCount: 33,
    removedOrphanCount: 3,
  })
  mocks.rebuildAllVectors.mockResolvedValue({ queuedBlockCount: 128 })
  mocks.removeMany.mockResolvedValue({ removed: 2, removedIds: ['block-1', 'block-2'] })
  mocks.retryFailed.mockResolvedValue(2)
  mocks.openDataDirectory.mockResolvedValue(undefined)
  mocks.openSettingsDirectory.mockResolvedValue(undefined)
  mocks.exportMarkdown.mockResolvedValue({ path: '/tmp/export.md', count: 128 })
  mocks.exportJson.mockResolvedValue({ path: '/tmp/export.json', count: 128 })
  mocks.previewMarkdown.mockResolvedValue(null)
  mocks.previewJson.mockResolvedValue(null)
  mocks.confirmImport.mockResolvedValue({ imported: 9 })
  mocks.refetch.mockResolvedValue(undefined)
})

describe('DataManagementView', () => {
  it('renders compact overview at the top and keeps cleanup as the main work area', () => {
    renderView()

    expect(screen.getByTestId('data-management-view')).toBeInTheDocument()
    expect(screen.getByTestId('data-management-view').className).toContain('bg-white')
    expect(screen.queryByText('总览、备份与维护')).not.toBeInTheDocument()
    expect(screen.getByTestId('data-management-metrics')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.queryByText('运行与索引')).not.toBeInTheDocument()
    expect(screen.getByText('这里只保留数据量、内容清理和备份入口；运行状态统一放到设置页面里。')).toBeInTheDocument()
    expect(screen.getByText('日期')).toBeInTheDocument()
    expect(screen.getByText('当前仍有内容的日期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加载 JSON' })).toBeInTheDocument()
    expect(screen.queryByTestId('data-management-maintenance')).not.toBeInTheDocument()
    expect(screen.getByText('按天浏览并批量删除')).toBeInTheDocument()
    expect(screen.getByTestId('data-management-cleanup-days')).toBeInTheDocument()
  })

  it('opens local directories and refreshes overview from the compact header', async () => {
    const { toast } = renderView()

    fireEvent.click(screen.getAllByRole('button', { name: '打开数据目录' })[0])
    await waitFor(() => {
      expect(mocks.openDataDirectory).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getAllByRole('button', { name: '打开设置目录' })[0])
    await waitFor(() => {
      expect(mocks.openSettingsDirectory).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(mocks.refetch).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('success', '已打开数据目录。')
    expect(toast).toHaveBeenCalledWith('success', '已打开设置目录。')
  })

  it('shows import preview and confirms import actions', async () => {
    const preview: ImportPreview = {
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
    }

    mocks.previewMarkdown.mockResolvedValue(preview)

    renderView()

    fireEvent.click(screen.getByRole('button', { name: '加载 Markdown' }))

    await waitFor(() => {
      expect(mocks.previewMarkdown).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('data-management-import-preview')).toBeInTheDocument()
    expect(screen.getByText(/weekly-note.md：本周总结/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全部覆盖冲突' }))

    await waitFor(() => {
      expect(mocks.confirmImport).toHaveBeenCalledWith('import-1', 'overwrite_all')
    })
  })

  it('cleans up blocks by day inside data management', async () => {
    const { toast } = renderView()

    expect(screen.getByTestId('data-management-cleanup-days')).toBeInTheDocument()
    expect(screen.getByText('这条内容需要清理')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mocks.removeMany).toHaveBeenCalledWith(['block-1', 'block-2'])
    })

    expect(mocks.refetch).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('success', '已删除 2 条内容。')
  })
})
