import { useCallback, useEffect, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import {
  BLOCK_ENRICH_SETTINGS_KEY,
  CALENDAR_SETTINGS_KEY,
  DEFAULT_AI_CONFIG,
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
  DOC_GENERATION_SETTINGS_KEY,
  UI_SETTINGS_KEY,
  parseAIConfig,
  normalizeBlockEnrichSettings,
  normalizeCalendarSettings,
  normalizeDocGenerationSettings,
  parseBlockEnrichSettings,
  parseCalendarSettings,
  parseDocGenerationSettings,
} from '../../shared/config'
import type {
  AIConfig,
  ApiTestResult,
  AppMeta,
  BlockEnrichSettings,
  CalendarSettings,
  DocGenerationSettings,
  ImportConflictStrategy,
  ImportPreview,
} from '../../shared/types'
import type { SettingsPanelProps } from '../components/SettingsPanel'
import { useToast } from '../components/toast-context'
import { normalizeRendererUISettings, parseRendererUISettings, type AppLanguage, type RendererUISettings } from '../i18n/locale'
import { useAppMeta } from './useAppMeta'
import { useExternalAccess } from './useExternalAccess'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { useI18n } from '../i18n/useI18n'

function formatCalendarSettingsSummary(settings: CalendarSettings, language: AppLanguage): string {
  if (!settings.aiSuggestionsEnabled) {
    return language === 'en' ? 'disabled' : '已关闭'
  }

  if (language === 'en') {
    return `enabled (max ${settings.maxSuggestionsPerBlock} per block, ${settings.autoAcceptAiSuggestions ? 'auto-add to calendar' : 'manual confirmation'})`
  }

  return `已启用（每块最多 ${settings.maxSuggestionsPerBlock} 条，${settings.autoAcceptAiSuggestions ? '自动加入日历' : '需手动确认'}）`
}

function localize(language: AppLanguage, zh: string, en: string): string {
  return language === 'en' ? en : zh
}

function buildSettingsSavedSummary(
  language: AppLanguage,
  mode: 'live' | 'mock',
  docGenerationSettings: DocGenerationSettings,
  blockEnrichSettings: BlockEnrichSettings,
  calendarSettings: CalendarSettings,
): string {
  if (language === 'en') {
    return `${mode === 'live' ? 'Settings saved. Live AI is active.' : 'Settings saved, but API test has not passed, so mock mode is still active.'} Docs: references ${docGenerationSettings.maxReferenceBlocks}, candidates ${docGenerationSettings.retrievalLimit}, output ${docGenerationSettings.maxOutputTokens} tokens, ${docGenerationSettings.streamOutput ? 'streaming on' : 'streaming off'}; enrich: ${blockEnrichSettings.queueEnabled ? `queue on (${blockEnrichSettings.maxBatchBlocks} blocks / ${blockEnrichSettings.queueDebounceMs}ms)` : 'single-item mode'}; calendar suggestions ${formatCalendarSettingsSummary(calendarSettings, language)}.`
  }

  return `${mode === 'live' ? '设置已保存，当前使用 live AI。' : '设置已保存，但尚未通过测试，当前仍使用 mock。'}文档生成引用上限 ${docGenerationSettings.maxReferenceBlocks}、候选 ${docGenerationSettings.retrievalLimit}、输出 ${docGenerationSettings.maxOutputTokens} token、${docGenerationSettings.streamOutput ? '已开启流式输出' : '已关闭流式输出'}；块 enrich ${blockEnrichSettings.queueEnabled ? `队列已启用（最多 ${blockEnrichSettings.maxBatchBlocks} 块 / ${blockEnrichSettings.queueDebounceMs}ms）` : '保持逐条'}；日历 AI 建议${formatCalendarSettingsSummary(calendarSettings, language)}。`
}

export function useSettingsController(): SettingsPanelProps {
  const { language } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const metaQuery = useAppMeta()
  const meta = metaQuery.data ?? null
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG)
  const [docGenerationSettings, setDocGenerationSettings] = useState<DocGenerationSettings>(DEFAULT_DOC_GENERATION_SETTINGS)
  const [blockEnrichSettings, setBlockEnrichSettings] = useState<BlockEnrichSettings>(DEFAULT_BLOCK_ENRICH_SETTINGS)
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS)
  const [uiSettings, setUiSettings] = useState<RendererUISettings>(() => parseRendererUISettings(null))
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsTesting, setSettingsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const {
    externalAccessStatus,
    externalAccessBusy,
    externalAccessBusyAction,
    refreshExternalAccess,
    enableExternalAccess,
    generateExternalAccessBundle,
    disableExternalAccess,
    openExternalAccessDirectory,
  } = useExternalAccess()

  const refreshMeta = useCallback(async (): Promise<AppMeta> => {
    await queryClient.refetchQueries({ queryKey: queryKeys.meta(), exact: true })
    const result = queryClient.getQueryData<AppMeta>(queryKeys.meta())

    if (!result) {
      throw new Error(language === 'en' ? 'Failed to refresh app state.' : '刷新应用状态失败。')
    }

    return result
  }, [language, queryClient])

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

      setConfig(parseAIConfig(savedConfig))

      setDocGenerationSettings(parseDocGenerationSettings(savedDoc))
      setBlockEnrichSettings(parseBlockEnrichSettings(savedBlock))
      setCalendarSettings(parseCalendarSettings(savedCalendar))
      setUiSettings(parseRendererUISettings(savedUi))
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

  const handleConfigChange = useCallback((nextConfig: AIConfig): void => {
    setConfig(nextConfig)
    setTestResult(null)
  }, [])

  const handleSaveSettings = useCallback(async (): Promise<void> => {
    setSettingsSaving(true)
    const normalizedDocGenerationSettings = normalizeDocGenerationSettings(docGenerationSettings)
    const normalizedBlockEnrichSettings = normalizeBlockEnrichSettings(blockEnrichSettings)
    const normalizedCalendarSettings = normalizeCalendarSettings(calendarSettings)
    const normalizedUISettings = normalizeRendererUISettings(uiSettings)
    const targetLanguage = normalizedUISettings.language

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
        buildSettingsSavedSummary(
          targetLanguage,
          nextMeta.activeAiMode === 'live' ? 'live' : 'mock',
          normalizedDocGenerationSettings,
          normalizedBlockEnrichSettings,
          normalizedCalendarSettings,
        ),
      )
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(targetLanguage, '设置保存失败。', 'Failed to save settings.'))
    } finally {
      setSettingsSaving(false)
    }
  }, [blockEnrichSettings, calendarSettings, config, docGenerationSettings, refreshMeta, toast, uiSettings])

  const handleTestSettings = useCallback(async (): Promise<void> => {
    setSettingsTesting(true)

    try {
      const result = await changbu.settings.testApi(config)
      setTestResult(result)
      await refreshMeta()
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, 'API 测试失败。', 'API test failed.'))
    } finally {
      setSettingsTesting(false)
    }
  }, [config, language, refreshMeta, toast])

  const handleExportJsonBackup = useCallback(async (): Promise<void> => {
    try {
      const result = await changbu.exports.json({ includeAttachments: true, includeSettings: true })

      if (!result) {
        toast('info', localize(language, '已取消 JSON 备份。', 'JSON backup canceled.'))
        return
      }

      toast('success', localize(language, `完整 JSON 备份已导出到 ${result.path}，共 ${result.count} 个块，并包含设置快照。`, `Full JSON backup exported to ${result.path}, ${result.count} blocks with settings snapshot.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, 'JSON 备份失败。', 'JSON backup failed.'))
    }
  }, [language, toast])

  const handlePreviewJsonImport = useCallback(async (): Promise<void> => {
    try {
      const preview = await changbu.imports.previewJson()

      if (!preview) {
        setImportPreview(null)
        toast('info', localize(language, '已取消 JSON 导入。', 'JSON import canceled.'))
        return
      }

      setImportPreview(preview)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, 'JSON 导入预览失败。', 'JSON import preview failed.'))
    }
  }, [language, toast])

  const handleConfirmImport = useCallback(async (strategy: ImportConflictStrategy): Promise<void> => {
    if (!importPreview) {
      return
    }

    try {
      const result = await changbu.imports.confirm(importPreview.importId, strategy)
      setImportPreview(null)
      toast('success', localize(language, `导入完成，共导入 ${result.imported} 个块。`, `Import completed: ${result.imported} blocks.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, '导入失败。', 'Import failed.'))
    }
  }, [importPreview, language, toast])

  const handleRetryFailedVectors = useCallback(async (): Promise<void> => {
    try {
      const count = await changbu.vectors.retryFailed()
      await refreshDataManagementState()
      toast('success', localize(language, `已重新入队 ${count} 个失败向量。`, `Re-queued ${count} failed vectors.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, '重试失败。', 'Retry failed.'))
    }
  }, [language, refreshDataManagementState, toast])

  const handleCleanupOrphanAttachments = useCallback(async (): Promise<void> => {
    try {
      const result = await changbu.data.cleanupOrphanAttachments()
      await refreshDataManagementState()
      toast('success', localize(language, `已清理 ${result.removedCount} 个孤儿附件。`, `Removed ${result.removedCount} orphan attachments.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, '清理孤儿附件失败。', 'Failed to cleanup orphan attachments.'))
    }
  }, [language, refreshDataManagementState, toast])

  const handleRebuildAttachmentIndex = useCallback(async (): Promise<void> => {
    try {
      const result = await changbu.data.rebuildAttachmentIndex()
      await refreshDataManagementState()
      toast('success', localize(language, `附件索引已重建：扫描 ${result.indexedBlockCount} 个块，登记 ${result.attachmentCount} 个附件，清理 ${result.removedOrphanCount} 个孤儿附件。`, `Attachment index rebuilt: scanned ${result.indexedBlockCount} blocks, registered ${result.attachmentCount} attachments, cleaned ${result.removedOrphanCount} orphan attachments.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, '重建附件索引失败。', 'Failed to rebuild attachment index.'))
    }
  }, [language, refreshDataManagementState, toast])

  const handleRebuildAllVectors = useCallback(async (): Promise<void> => {
    try {
      const result = await changbu.data.rebuildAllVectors()
      await refreshDataManagementState()
      toast('success', localize(language, `已重新排队全部块的向量任务，共 ${result.queuedBlockCount} 条。`, `Re-queued vectors for all blocks: ${result.queuedBlockCount} tasks.`))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : localize(language, '重建全部向量失败。', 'Failed to rebuild all vectors.'))
    }
  }, [language, refreshDataManagementState, toast])

  return {
    config,
    docGenerationSettings,
    blockEnrichSettings,
    calendarSettings,
    uiSettings,
    meta,
    saving: settingsSaving,
    testing: settingsTesting,
    testResult,
    importPreview,
    onChange: handleConfigChange,
    onDocGenerationSettingsChange: setDocGenerationSettings,
    onBlockEnrichSettingsChange: setBlockEnrichSettings,
    onCalendarSettingsChange: setCalendarSettings,
    onUISettingsChange: setUiSettings,
    onSave: handleSaveSettings,
    onTest: handleTestSettings,
    onCreateBackup: handleExportJsonBackup,
    onLoadBackupPreview: handlePreviewJsonImport,
    onConfirmImport: handleConfirmImport,
    onDismissImportPreview: () => {
      setImportPreview(null)
    },
    onRetryFailedVectors: handleRetryFailedVectors,
    onCleanupOrphanAttachments: handleCleanupOrphanAttachments,
    onRebuildAttachmentIndex: handleRebuildAttachmentIndex,
    onRebuildAllVectors: handleRebuildAllVectors,
    onOpenDataDirectory: async () => {
      await changbu.settings.openDataDirectory()
    },
    onOpenSettingsDirectory: async () => {
      await changbu.settings.openSettingsDirectory()
    },
    externalAccessStatus,
    externalAccessBusy,
    externalAccessBusyAction,
    onEnableExternalAccess: enableExternalAccess,
    onGenerateExternalAccessBundle: generateExternalAccessBundle,
    onDisableExternalAccess: disableExternalAccess,
    onRefreshExternalAccess: async () => {
      await refreshExternalAccess({ successMessage: localize(language, '已刷新外部接入状态。', 'External access status refreshed.') })
    },
    onOpenExternalAccessDirectory: openExternalAccessDirectory,
  }
}
