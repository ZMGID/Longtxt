import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPanel } from './SettingsPanel'
import { ToastContext } from './toast-context'

function renderSettings(overrides: Partial<ComponentProps<typeof SettingsPanel>> = {}) {
  const toast = vi.fn()
  const props: ComponentProps<typeof SettingsPanel> = {
    config: {
      llm: {
        endpoint: '',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
      embedding: {
        endpoint: '',
        apiKey: '',
        model: 'text-embedding-3-small',
      },
    },
    docGenerationSettings: {
      maxReferenceBlocks: 10,
      retrievalLimit: 30,
      temperature: 0.1,
      maxOutputTokens: 1200,
    },
    blockEnrichSettings: {
      queueEnabled: false,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    },
    calendarSettings: {
      aiSuggestionsEnabled: true,
      autoAcceptAiSuggestions: false,
      maxSuggestionsPerBlock: 3,
      upcomingDays: 30,
    },
    uiSettings: {
      showMiniTimeline: true,
    },
    meta: {
      dataDirectory: '/tmp/changbu',
      totalBlockCount: 20,
      vectorReady: true,
      aiConfigured: false,
      resolvedBaseUrl: null,
      vectorDimension: 1024,
      vectorSchemaReady: true,
      activeAiMode: 'mock',
      lastAiError: null,
      lastAiTestResult: null,
      modelCallCounts: { llm: 0, embedding: 0 },
      tokenUsage: null,
      lifetimeTokenUsage: null,
      failedVectorCount: 2,
      pendingVectorCount: 1,
      vectorQueueProcessing: true,
    },
    saving: false,
    testing: false,
    testResult: null,
    importPreview: null,
    onRetryFailedVectors: vi.fn(async () => {}),
    onCleanupOrphanAttachments: vi.fn(async () => {}),
    onRebuildAttachmentIndex: vi.fn(async () => {}),
    onRebuildAllVectors: vi.fn(async () => {}),
    onChange: vi.fn(),
    onDocGenerationSettingsChange: vi.fn(),
    onBlockEnrichSettingsChange: vi.fn(),
    onCalendarSettingsChange: vi.fn(),
    onUISettingsChange: vi.fn(),
    onSave: vi.fn(async () => {}),
    onTest: vi.fn(async () => {}),
    onCreateBackup: vi.fn(async () => {}),
    onLoadBackupPreview: vi.fn(async () => {}),
    onConfirmImport: vi.fn(async () => {}),
    onDismissImportPreview: vi.fn(),
    onOpenDataDirectory: vi.fn(async () => {}),
    onOpenSettingsDirectory: vi.fn(async () => {}),
    ...overrides,
  }

  render(
    <ToastContext.Provider value={{ toast }}>
      <SettingsPanel {...props} />
    </ToastContext.Provider>,
  )
  return { props, toast }
}

describe('SettingsPanel', () => {
  it('uses left navigation sections and wires common, backup, advanced, and directory actions', () => {
    const { props } = renderSettings()

    expect(screen.getByText('应用信息与运行状态')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /启用 AI 日期建议/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-nav-general'))

    expect(screen.getByRole('checkbox', { name: /启用 AI 日期建议/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /AI 建议自动加入日历/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: /显示左侧时间线/ })).toBeChecked()
    expect(screen.queryByRole('spinbutton', { name: /最大引用块数/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /AI 建议自动加入日历/ }))
    expect(props.onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: true,
      autoAcceptAiSuggestions: true,
      maxSuggestionsPerBlock: 3,
      upcomingDays: 30,
    })

    fireEvent.click(screen.getByTestId('settings-nav-backup'))
    fireEvent.click(screen.getByTestId('settings-create-backup'))
    fireEvent.click(screen.getByTestId('settings-load-backup'))

    expect(props.onCreateBackup).toHaveBeenCalledTimes(1)
    expect(props.onLoadBackupPreview).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('settings-nav-advanced'))

    expect(screen.getByTestId('settings-advanced-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始清理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重建附件索引' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: /最大引用块数/ }), { target: { value: '12' } })
    expect(props.onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 12,
      retrievalLimit: 30,
      temperature: 0.1,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /召回候选块数/ }), { target: { value: '40' } })
    expect(props.onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 40,
      temperature: 0.1,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /生成温度/ }), { target: { value: '0.35' } })
    expect(props.onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 30,
      temperature: 0.35,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /输出 Token 上限/ }), { target: { value: '1800' } })
    expect(props.onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 30,
      temperature: 0.1,
      maxOutputTokens: 1800,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /启用 live enrich 队列/ }))
    expect(props.onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: true,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /单次最多合并块数/ }), { target: { value: '7' } })
    expect(props.onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 7,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /聚合等待时间/ }), { target: { value: '1200' } })
    expect(props.onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 5,
      queueDebounceMs: 1200,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /预留输出 Token/ }), { target: { value: '2400' } })
    expect(props.onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 2400,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /每块最多建议条数/ }), { target: { value: '4' } })
    expect(props.onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: true,
      autoAcceptAiSuggestions: false,
      maxSuggestionsPerBlock: 4,
      upcomingDays: 30,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /未来安排窗口/ }), { target: { value: '45' } })
    expect(props.onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: true,
      autoAcceptAiSuggestions: false,
      maxSuggestionsPerBlock: 3,
      upcomingDays: 45,
    })

    fireEvent.click(screen.getByTestId('settings-cleanup-attachments'))
    fireEvent.click(screen.getByTestId('settings-retry-vectors'))
    fireEvent.click(screen.getByTestId('settings-rebuild-attachments'))
    fireEvent.click(screen.getByTestId('settings-rebuild-vectors'))

    expect(props.onCleanupOrphanAttachments).toHaveBeenCalledTimes(1)
    expect(props.onRetryFailedVectors).toHaveBeenCalledTimes(1)
    expect(props.onRebuildAttachmentIndex).toHaveBeenCalledTimes(1)
    expect(props.onRebuildAllVectors).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('settings-nav-files'))
    fireEvent.click(screen.getByRole('button', { name: '打开设置文件目录' }))
    expect(props.onOpenSettingsDirectory).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('settings-nav-general'))
    fireEvent.click(screen.getByRole('checkbox', { name: /显示左侧时间线/ }))
    expect(props.onUISettingsChange).toHaveBeenCalledWith({ showMiniTimeline: false })
  })

  it('shows backup import preview actions and forwards conflict decisions', () => {
    const { props } = renderSettings({
      importPreview: {
        importId: 'import-1',
        format: 'json',
        totalFiles: 1,
        totalBlocks: 12,
        conflicts: 2,
        samples: [
          {
            filename: 'backup.json',
            preview: '示例块内容',
          },
        ],
      },
    })

    expect(screen.getByTestId('settings-import-preview')).toBeInTheDocument()
    expect(screen.getByText(/backup.json：示例块内容/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全部跳过冲突' }))
    fireEvent.click(screen.getByRole('button', { name: '全部覆盖冲突' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(props.onConfirmImport).toHaveBeenCalledWith('skip_all')
    expect(props.onConfirmImport).toHaveBeenCalledWith('overwrite_all')
    expect(props.onDismissImportPreview).toHaveBeenCalledTimes(1)
  })

  it('disables auto-accept when AI date suggestions are turned off', () => {
    renderSettings({
      calendarSettings: {
        aiSuggestionsEnabled: false,
        autoAcceptAiSuggestions: true,
        maxSuggestionsPerBlock: 3,
        upcomingDays: 30,
      },
    })

    fireEvent.click(screen.getByTestId('settings-nav-general'))
    expect(screen.getByRole('checkbox', { name: /AI 建议自动加入日历/ })).toBeDisabled()
  })

  it('disables rebuild-all-vectors in advanced settings when ai is configured but not live', () => {
    renderSettings({
      meta: {
        dataDirectory: '/tmp/changbu',
        totalBlockCount: 20,
        vectorReady: true,
        aiConfigured: true,
        resolvedBaseUrl: 'https://api.openai.com/v1',
        vectorDimension: 1024,
        vectorSchemaReady: true,
        activeAiMode: 'mock',
        lastAiError: null,
        lastAiTestResult: null,
        modelCallCounts: { llm: 0, embedding: 0 },
        tokenUsage: null,
        lifetimeTokenUsage: null,
        failedVectorCount: 0,
        pendingVectorCount: 0,
        vectorQueueProcessing: false,
      },
    })

    fireEvent.click(screen.getByTestId('settings-nav-advanced'))
    expect(screen.getByTestId('settings-rebuild-vectors')).toBeDisabled()
    expect(screen.getByText(/已配置 AI 但尚未完成测试/)).toBeInTheDocument()
  })

  it('shows compact token usage panels for current session and lifetime totals', () => {
    renderSettings({
      meta: {
        dataDirectory: '/tmp/changbu',
        totalBlockCount: 20,
        vectorReady: true,
        aiConfigured: true,
        resolvedBaseUrl: 'https://api.example.com/v1',
        vectorDimension: 1024,
        vectorSchemaReady: true,
        activeAiMode: 'live',
        lastAiError: null,
        lastAiTestResult: null,
        modelCallCounts: { llm: 2, embedding: 1 },
        tokenUsage: {
          promptTokens: 120,
          completionTokens: 80,
          totalTokens: 200,
          requestCount: 3,
        },
        lifetimeTokenUsage: {
          promptTokens: 360,
          completionTokens: 240,
          totalTokens: 600,
          requestCount: 9,
        },
        failedVectorCount: 0,
        pendingVectorCount: 0,
        vectorQueueProcessing: false,
      },
    })

    expect(screen.getByText('Token 使用')).toBeInTheDocument()
    expect(screen.getByText('当前会话')).toBeInTheDocument()
    expect(screen.getByText('累计总计')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('360')).toBeInTheDocument()
    expect(screen.getByText('240')).toBeInTheDocument()
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getByText('3 次请求')).toBeInTheDocument()
    expect(screen.getByText('9 次请求')).toBeInTheDocument()
  })

  it('catches directory open errors and reports them with toast', async () => {
    const { toast } = renderSettings({
      onOpenDataDirectory: vi.fn(async () => {
        throw new Error('目录打不开')
      }),
    })

    fireEvent.click(screen.getByTestId('settings-nav-files'))
    fireEvent.click(screen.getByRole('button', { name: '打开数据目录' }))

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('error', '目录打不开')
    })
  })
})
