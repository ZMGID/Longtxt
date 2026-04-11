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
  TokenUsage,
  UISettings,
} from '../../../shared/types'

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

export type SettingsSectionId = 'about' | 'general' | 'ai' | 'external-access' | 'backup' | 'files' | 'advanced'

export type SettingsNavGroup = {
  title: string
  items: Array<{
    id: SettingsSectionId
    label: string
    hint: string
  }>
}

export interface SettingsPageTitle {
  eyebrow: string
  title: string
  description: string
}

export interface TokenUsagePanelProps {
  title: string
  hint: string
  usage: TokenUsage | null | undefined
  language: 'zh' | 'en'
}
