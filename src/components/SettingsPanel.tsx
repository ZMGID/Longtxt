import { useMemo, useState } from 'react'

import type {
  AIConfig,
  ApiTestResult,
  AppMeta,
  BlockEnrichSettings,
  CalendarSettings,
  DocGenerationSettings,
  ExternalAccessStatus,
  ImportConflictStrategy,
  ImportPreview,
  UISettings,
} from '../../shared/types'
import { useI18n } from '../i18n/useI18n'
import { ActionButton } from './ui/ActionButton'
import { useToast } from './toast-context'
import { SettingsNavButton } from './settings/navigation'
import { buildSettingsNavGroups, countAdvancedOverrides, getSettingsPageTitle, localize } from './settings/utils'
import type { SettingsSectionId } from './settings/types'
import { AboutSection } from './settings/sections/AboutSection'
import { GeneralSection } from './settings/sections/GeneralSection'
import { AiSection } from './settings/sections/AiSection'
import { ExternalAccessSection } from './settings/sections/ExternalAccessSection'
import { BackupSection } from './settings/sections/BackupSection'
import { FilesSection } from './settings/sections/FilesSection'
import { AdvancedSection } from './settings/sections/AdvancedSection'

export interface SettingsPanelProps {
  config: AIConfig
  docGenerationSettings: DocGenerationSettings
  blockEnrichSettings: BlockEnrichSettings
  calendarSettings: CalendarSettings
  uiSettings: UISettings
  meta: AppMeta | null
  saving: boolean
  testing: boolean
  testResult: ApiTestResult | null
  importPreview: ImportPreview | null
  onRetryFailedVectors?: () => Promise<void>
  onCleanupOrphanAttachments?: () => Promise<void>
  onRebuildAttachmentIndex?: () => Promise<void>
  onRebuildAllVectors?: () => Promise<void>
  onChange: (nextConfig: AIConfig) => void
  onDocGenerationSettingsChange: (nextSettings: DocGenerationSettings) => void
  onBlockEnrichSettingsChange: (nextSettings: BlockEnrichSettings) => void
  onCalendarSettingsChange: (nextSettings: CalendarSettings) => void
  onUISettingsChange: (nextSettings: UISettings) => void
  onSave: () => Promise<void>
  onTest: () => Promise<void>
  onCreateBackup: () => Promise<void>
  onLoadBackupPreview: () => Promise<void>
  onConfirmImport: (strategy: ImportConflictStrategy) => Promise<void>
  onDismissImportPreview: () => void
  onOpenDataDirectory: () => Promise<void>
  onOpenSettingsDirectory: () => Promise<void>
  externalAccessStatus: ExternalAccessStatus | null
  externalAccessBusy: boolean
  externalAccessBusyAction?: 'enable' | 'generate' | 'disable' | 'open' | 'refresh' | null
  onEnableExternalAccess: () => Promise<void>
  onGenerateExternalAccessBundle: () => Promise<void>
  onDisableExternalAccess: () => Promise<void>
  onRefreshExternalAccess: () => Promise<void>
  onOpenExternalAccessDirectory: () => Promise<void>
}

export function SettingsPanel({
  config,
  docGenerationSettings,
  blockEnrichSettings,
  calendarSettings,
  uiSettings,
  meta,
  saving,
  testing,
  testResult,
  importPreview,
  onRetryFailedVectors,
  onCleanupOrphanAttachments,
  onRebuildAttachmentIndex,
  onRebuildAllVectors,
  onChange,
  onDocGenerationSettingsChange,
  onBlockEnrichSettingsChange,
  onCalendarSettingsChange,
  onUISettingsChange,
  onSave,
  onTest,
  onCreateBackup,
  onLoadBackupPreview,
  onConfirmImport,
  onDismissImportPreview,
  onOpenDataDirectory,
  onOpenSettingsDirectory,
  externalAccessStatus,
  externalAccessBusy,
  externalAccessBusyAction,
  onEnableExternalAccess,
  onGenerateExternalAccessBundle,
  onDisableExternalAccess,
  onRefreshExternalAccess,
  onOpenExternalAccessDirectory,
}: SettingsPanelProps) {
  const { language, t } = useI18n()
  const { toast } = useToast()
  const navGroups = useMemo(() => buildSettingsNavGroups(language), [language])
  const advancedOverrideCount = countAdvancedOverrides(docGenerationSettings, blockEnrichSettings, calendarSettings)
  const multimodalStatusLabel = !config.multimodalImageAnalysisEnabled
    ? t('settings.ai.multimodalStatusDisabled')
    : testResult
      ? testResult.llmMultimodalOk
        ? t('settings.ai.multimodalStatusPassed')
        : t('settings.ai.multimodalStatusFailed')
      : t('settings.ai.multimodalStatusUntested')
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(importPreview ? 'backup' : 'about')
  const [fileActionPending, setFileActionPending] = useState<'data-directory' | 'settings-directory' | null>(null)

  const pageTitle = useMemo(() => getSettingsPageTitle(activeSection, language), [activeSection, language])

  const headerActions = useMemo(() => {
    switch (activeSection) {
      case 'general':
      case 'advanced':
        return (
            <ActionButton primary disabled={saving} onClick={() => { void onSave() }}>
            {saving ? t('settings.common.saving') : t('settings.common.save')}
            </ActionButton>
        )
      case 'ai':
        return (
          <>
            <ActionButton primary disabled={saving} onClick={() => { void onSave() }}>
              {saving ? t('settings.common.saving') : t('settings.common.save')}
            </ActionButton>
            <ActionButton disabled={testing} onClick={() => { void onTest() }}>
              {testing ? t('settings.common.testing') : t('settings.common.testConnection')}
            </ActionButton>
          </>
        )
      default:
        return null
    }
  }, [activeSection, onSave, onTest, saving, t, testing])

  async function runFileAction(
    action: 'data-directory' | 'settings-directory',
    task: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<void> {
    if (fileActionPending) {
      return
    }

    setFileActionPending(action)

    try {
      await task()
    } catch (error) {
      toast('error', error instanceof Error ? error.message : fallbackMessage)
    } finally {
      setFileActionPending(null)
    }
  }

  async function copyExternalAccessCommand(): Promise<void> {
    if (!externalAccessStatus || typeof navigator?.clipboard?.writeText !== 'function') {
      toast('error', t('settings.external.copyUnsupported'))
      return
    }

    try {
      await navigator.clipboard.writeText(externalAccessStatus.searchCommandExample)
      toast('success', t('settings.external.copyDone'))
    } catch {
      toast('error', t('settings.external.copyFailed'))
    }
  }

  function renderSectionContent() {
    switch (activeSection) {
      case 'about':
        return <AboutSection meta={meta} language={language} />
      case 'general':
        return (
          <GeneralSection
            calendarSettings={calendarSettings}
            uiSettings={uiSettings}
            onCalendarSettingsChange={onCalendarSettingsChange}
            onUISettingsChange={onUISettingsChange}
            language={language}
            t={t}
          />
        )
      case 'ai':
        return (
          <AiSection
            config={config}
            onChange={onChange}
            language={language}
            t={t}
            multimodalStatusLabel={multimodalStatusLabel}
          />
        )
      case 'external-access':
        return (
          <ExternalAccessSection
            externalAccessStatus={externalAccessStatus}
            externalAccessBusy={externalAccessBusy}
            externalAccessBusyAction={externalAccessBusyAction}
            onEnableExternalAccess={onEnableExternalAccess}
            onGenerateExternalAccessBundle={onGenerateExternalAccessBundle}
            onDisableExternalAccess={onDisableExternalAccess}
            onRefreshExternalAccess={onRefreshExternalAccess}
            onOpenExternalAccessDirectory={onOpenExternalAccessDirectory}
            onCopyCommand={copyExternalAccessCommand}
            language={language}
          />
        )
      case 'backup':
        return (
          <BackupSection
            importPreview={importPreview}
            onCreateBackup={onCreateBackup}
            onLoadBackupPreview={onLoadBackupPreview}
            onConfirmImport={onConfirmImport}
            onDismissImportPreview={onDismissImportPreview}
            language={language}
          />
        )
      case 'files':
        return (
          <FilesSection
            onOpenDataDirectory={onOpenDataDirectory}
            onOpenSettingsDirectory={onOpenSettingsDirectory}
            language={language}
            fileActionPending={fileActionPending}
            onFileAction={runFileAction}
          />
        )
      case 'advanced':
        return (
          <AdvancedSection
            docGenerationSettings={docGenerationSettings}
            blockEnrichSettings={blockEnrichSettings}
            calendarSettings={calendarSettings}
            meta={meta}
            onDocGenerationSettingsChange={onDocGenerationSettingsChange}
            onBlockEnrichSettingsChange={onBlockEnrichSettingsChange}
            onCalendarSettingsChange={onCalendarSettingsChange}
            onRetryFailedVectors={onRetryFailedVectors}
            onCleanupOrphanAttachments={onCleanupOrphanAttachments}
            onRebuildAttachmentIndex={onRebuildAttachmentIndex}
            onRebuildAllVectors={onRebuildAllVectors}
            language={language}
          />
        )
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 border-t border-stone-200 bg-white text-stone-900" data-testid="settings-panel">
      <aside className="w-[250px] shrink-0 border-r border-stone-200 bg-white px-4 pb-6 pt-5" data-testid="settings-sidebar">
        <div className="space-y-6">
          {navGroups.map((group: { title: string; items: Array<{ id: SettingsSectionId; label: string; hint: string }> }) => (
            <div key={group.title}>
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">{group.title}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SettingsNavButton
                    key={item.id}
                    section={item.id}
                    label={item.label}
                    hint={item.hint}
                    active={item.id === activeSection}
                    badge={item.id === 'advanced' && advancedOverrideCount > 0 ? `${advancedOverrideCount}` : undefined}
                    onClick={() => setActiveSection(item.id)}
                    testId={
                      item.id === 'general'
                        ? 'settings-nav-general'
                        : item.id === 'external-access'
                          ? 'settings-nav-external-access'
                        : item.id === 'backup'
                          ? 'settings-nav-backup'
                          : item.id === 'advanced'
                            ? 'settings-nav-advanced'
                            : item.id === 'files'
                              ? 'settings-nav-files'
                              : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-12 pb-10 pt-2">
        <div className="mx-auto max-w-[820px]">
          <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{pageTitle.eyebrow}</div>
              <h2 className="mt-3 text-[30px] font-semibold text-stone-900">{pageTitle.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{pageTitle.description}</p>
            </div>
            {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
          </header>

          {testResult ? (
            <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${testResult.success ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {testResult.success
                ? localize(language,
                  `连接成功：Models ${testResult.modelsOk ? 'OK' : '失败'} / Embedding ${testResult.embeddingOk ? 'OK' : '失败'} / LLM ${testResult.llmOk ? 'OK' : '失败'} / Stream ${testResult.llmStreamingOk ? 'OK' : '失败'} / 多模态 ${config.multimodalImageAnalysisEnabled ? (testResult.llmMultimodalOk ? 'OK' : '失败') : '未启用'}`,
                  `Connection succeeded: Models ${testResult.modelsOk ? 'OK' : 'Failed'} / Embedding ${testResult.embeddingOk ? 'OK' : 'Failed'} / LLM ${testResult.llmOk ? 'OK' : 'Failed'} / Stream ${testResult.llmStreamingOk ? 'OK' : 'Failed'} / Multimodal ${config.multimodalImageAnalysisEnabled ? (testResult.llmMultimodalOk ? 'OK' : 'Failed') : 'Disabled'}` )
                : testResult.error}
            </div>
          ) : null}

          {renderSectionContent()}
        </div>
      </div>
    </section>
  )
}
