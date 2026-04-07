import { useCallback, useEffect, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import {
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DEFAULT_AI_CONFIG,
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
  DEFAULT_UI_SETTINGS,
  DOC_GENERATION_SETTINGS_KEY,
  UI_SETTINGS_KEY,
  normalizeBlockEnrichSettings,
  normalizeCalendarSettings,
  normalizeDocGenerationSettings,
  normalizeUISettings,
  parseBlockEnrichSettings,
  parseCalendarSettings,
  parseDocGenerationSettings,
  parseUISettings,
} from '../shared/config'
import type {
  AIConfig,
  ApiTestResult,
  AppMeta,
  BlockEnrichSettings,
  CalendarSettings,
  DocGenerationSettings,
  ImportConflictStrategy,
  ImportPreview,
  UISettings,
} from '../shared/types'
import { ChangbuEventBridge } from './components/ChangbuEventBridge'
import { SettingsPanel } from './components/SettingsPanel'
import { ToastProvider } from './components/Toast'
import { useToast } from './components/toast-context'
import { useAppMeta } from './hooks/useAppMeta'
import { changbu } from './lib/changbu'
import { queryKeys } from './lib/queryKeys'

export default function SettingsWindowApp() {
  return (
    <ToastProvider>
      <SettingsWindowInner />
    </ToastProvider>
  )
}

function SettingsWindowInner() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const metaQuery = useAppMeta()
  const meta = metaQuery.data ?? null
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG)
  const [docGenerationSettings, setDocGenerationSettings] = useState<DocGenerationSettings>(DEFAULT_DOC_GENERATION_SETTINGS)
  const [blockEnrichSettings, setBlockEnrichSettings] = useState<BlockEnrichSettings>(DEFAULT_BLOCK_ENRICH_SETTINGS)
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS)
  const [uiSettings, setUiSettings] = useState<UISettings>(DEFAULT_UI_SETTINGS)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsTesting, setSettingsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const refreshMeta = useCallback(async (): Promise<AppMeta> => {
    await queryClient.refetchQueries({ queryKey: queryKeys.meta(), exact: true })
    const result = queryClient.getQueryData<AppMeta>(queryKeys.meta())

    if (!result) {
      throw new Error('刷新应用状态失败。')
    }

    return result
  }, [queryClient])

  const refreshDataManagementState = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshMeta(),
      queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement(), exact: true }),
    ])
  }, [queryClient, refreshMeta])

  useEffect(() => {
    let active = true

    async function syncStoredSettings(): Promise<void> {
      const [savedConfig, savedDoc, savedBlock, savedCalendar, savedUi] = await Promise.all([
        changbu.settings.get('ai_config'),
        changbu.settings.get(DOC_GENERATION_SETTINGS_KEY),
        changbu.settings.get(BLOCK_ENRICH_SETTINGS_KEY),
        changbu.settings.get(CALENDAR_SETTINGS_KEY),
        changbu.settings.get(UI_SETTINGS_KEY),
      ])

      if (!active) {
        return
      }

      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig) as AIConfig
          setConfig({
            llm: {
              ...DEFAULT_AI_CONFIG.llm,
              ...parsed.llm,
            },
            embedding: {
              ...DEFAULT_AI_CONFIG.embedding,
              ...parsed.embedding,
            },
          })
        } catch {
          setConfig(DEFAULT_AI_CONFIG)
        }
      } else {
        setConfig(DEFAULT_AI_CONFIG)
      }

      setDocGenerationSettings(parseDocGenerationSettings(savedDoc))
      setBlockEnrichSettings(parseBlockEnrichSettings(savedBlock))
      setCalendarSettings(parseCalendarSettings(savedCalendar))
      setUiSettings(parseUISettings(savedUi))
    }

    void syncStoredSettings()

    const unsubscribeMeta = changbu.events.onMetaChanged((event) => {
      if (event.reason === 'settings') {
        void syncStoredSettings()
      }
    })

    return () => {
      active = false
      unsubscribeMeta()
    }
  }, [])

  function handleConfigChange(nextConfig: AIConfig): void {
    setConfig(nextConfig)
    setTestResult(null)
  }

  function formatCalendarSettingsSummary(settings: CalendarSettings): string {
    if (!settings.aiSuggestionsEnabled) {
      return '已关闭'
    }

    return `已启用（每块最多 ${settings.maxSuggestionsPerBlock} 条，${settings.autoAcceptAiSuggestions ? '自动加入日历' : '需手动确认'}）`
  }

  async function handleSaveSettings(): Promise<void> {
    setSettingsSaving(true)
    const normalizedDocGenerationSettings = normalizeDocGenerationSettings(docGenerationSettings)
    const normalizedBlockEnrichSettings = normalizeBlockEnrichSettings(blockEnrichSettings)
    const normalizedCalendarSettings = normalizeCalendarSettings(calendarSettings)
    const normalizedUISettings = normalizeUISettings(uiSettings)

    try {
      await changbu.settings.set('ai_config', JSON.stringify(config))
      await changbu.settings.set(DOC_GENERATION_SETTINGS_KEY, JSON.stringify(normalizedDocGenerationSettings))
      await changbu.settings.set(BLOCK_ENRICH_SETTINGS_KEY, JSON.stringify(normalizedBlockEnrichSettings))
      await changbu.settings.set(CALENDAR_SETTINGS_KEY, JSON.stringify(normalizedCalendarSettings))
      await changbu.settings.set(UI_SETTINGS_KEY, JSON.stringify(normalizedUISettings))
      setDocGenerationSettings(normalizedDocGenerationSettings)
      setBlockEnrichSettings(normalizedBlockEnrichSettings)
      setCalendarSettings(normalizedCalendarSettings)
      setUiSettings(normalizedUISettings)
      const nextMeta = await refreshMeta()
      toast(
        nextMeta.activeAiMode === 'live' ? 'success' : 'info',
        nextMeta.activeAiMode === 'live'
          ? `设置已保存，当前使用 live AI。文档生成引用上限 ${normalizedDocGenerationSettings.maxReferenceBlocks}、候选 ${normalizedDocGenerationSettings.retrievalLimit}、输出 ${normalizedDocGenerationSettings.maxOutputTokens} token；块 enrich ${normalizedBlockEnrichSettings.queueEnabled ? `队列已启用（最多 ${normalizedBlockEnrichSettings.maxBatchBlocks} 块 / ${normalizedBlockEnrichSettings.queueDebounceMs}ms）` : '保持逐条'}；日历 AI 建议${formatCalendarSettingsSummary(normalizedCalendarSettings)}。`
          : `设置已保存，但尚未通过测试，当前仍使用 mock。文档生成引用上限 ${normalizedDocGenerationSettings.maxReferenceBlocks}、候选 ${normalizedDocGenerationSettings.retrievalLimit}、输出 ${normalizedDocGenerationSettings.maxOutputTokens} token；块 enrich ${normalizedBlockEnrichSettings.queueEnabled ? `队列已启用（最多 ${normalizedBlockEnrichSettings.maxBatchBlocks} 块 / ${normalizedBlockEnrichSettings.queueDebounceMs}ms）` : '保持逐条'}；日历 AI 建议${formatCalendarSettingsSummary(normalizedCalendarSettings)}。`,
      )
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '设置保存失败。')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleTestSettings(): Promise<void> {
    setSettingsTesting(true)

    try {
      const result = await changbu.settings.testApi(config)
      setTestResult(result)
      await refreshMeta()
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : 'API 测试失败。')
    } finally {
      setSettingsTesting(false)
    }
  }

  async function handleExportJsonBackup(): Promise<void> {
    try {
      const result = await changbu.exports.json({ includeAttachments: true })

      if (!result) {
        toast('info', '已取消 JSON 备份。')
        return
      }

      toast('success', `JSON 备份已导出到 ${result.path}，共 ${result.count} 个块。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : 'JSON 备份失败。')
    }
  }

  async function handlePreviewJsonImport(): Promise<void> {
    try {
      const preview = await changbu.imports.previewJson()

      if (!preview) {
        setImportPreview(null)
        toast('info', '已取消 JSON 导入。')
        return
      }

      setImportPreview(preview)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : 'JSON 导入预览失败。')
    }
  }

  async function handleConfirmImport(strategy: ImportConflictStrategy): Promise<void> {
    if (!importPreview) {
      return
    }

    try {
      const result = await changbu.imports.confirm(importPreview.importId, strategy)
      setImportPreview(null)
      toast('success', `导入完成，共导入 ${result.imported} 个块。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '导入失败。')
    }
  }

  async function handleRetryFailedVectors(): Promise<void> {
    try {
      const count = await changbu.vectors.retryFailed()
      await refreshDataManagementState()
      toast('success', `已重新入队 ${count} 个失败向量。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '重试失败。')
    }
  }

  async function handleCleanupOrphanAttachments(): Promise<void> {
    try {
      const result = await changbu.data.cleanupOrphanAttachments()
      await refreshDataManagementState()
      toast('success', `已清理 ${result.removedCount} 个孤儿附件。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '清理孤儿附件失败。')
    }
  }

  async function handleRebuildAttachmentIndex(): Promise<void> {
    try {
      const result = await changbu.data.rebuildAttachmentIndex()
      await refreshDataManagementState()
      toast('success', `附件索引已重建：扫描 ${result.indexedBlockCount} 个块，登记 ${result.attachmentCount} 个附件，清理 ${result.removedOrphanCount} 个孤儿附件。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '重建附件索引失败。')
    }
  }

  async function handleRebuildAllVectors(): Promise<void> {
    try {
      const result = await changbu.data.rebuildAllVectors()
      await refreshDataManagementState()
      toast('success', `已重新排队全部块的向量任务，共 ${result.queuedBlockCount} 条。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '重建全部向量失败。')
    }
  }

  return (
    <>
      <ChangbuEventBridge />

      <div className="flex h-screen flex-col overflow-hidden bg-[#f7f5f2] text-stone-900">
        <div className="window-drag-region flex h-11 shrink-0 items-center justify-end px-3">
          <button
            type="button"
            aria-label="关闭设置窗口"
            data-testid="settings-window-close"
            onClick={() => window.close()}
            className="window-no-drag flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-black/[0.04] hover:text-stone-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m5 5 10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 px-0 pb-0">
          <SettingsPanel
            config={config}
            docGenerationSettings={docGenerationSettings}
            blockEnrichSettings={blockEnrichSettings}
            calendarSettings={calendarSettings}
            uiSettings={uiSettings}
            meta={meta}
            saving={settingsSaving}
            testing={settingsTesting}
            testResult={testResult}
            importPreview={importPreview}
            onChange={handleConfigChange}
            onDocGenerationSettingsChange={setDocGenerationSettings}
            onBlockEnrichSettingsChange={setBlockEnrichSettings}
            onCalendarSettingsChange={setCalendarSettings}
            onUISettingsChange={setUiSettings}
            onSave={handleSaveSettings}
            onTest={handleTestSettings}
            onCreateBackup={handleExportJsonBackup}
            onLoadBackupPreview={handlePreviewJsonImport}
            onConfirmImport={handleConfirmImport}
            onDismissImportPreview={() => {
              setImportPreview(null)
            }}
            onRetryFailedVectors={handleRetryFailedVectors}
            onCleanupOrphanAttachments={handleCleanupOrphanAttachments}
            onRebuildAttachmentIndex={handleRebuildAttachmentIndex}
            onRebuildAllVectors={handleRebuildAllVectors}
            onOpenDataDirectory={async () => {
              await changbu.settings.openDataDirectory()
            }}
            onOpenSettingsDirectory={async () => {
              await changbu.settings.openSettingsDirectory()
            }}
          />
        </div>
      </div>
    </>
  )
}
