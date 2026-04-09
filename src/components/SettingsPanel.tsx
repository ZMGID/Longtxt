import { useMemo, useState, type ReactNode } from 'react'

import {
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
  MAX_BLOCK_ENRICH_BATCH_BLOCKS,
  MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS,
  MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS,
  MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK,
  MAX_CALENDAR_UPCOMING_DAYS,
  MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS,
  MAX_DOC_GENERATION_REFERENCE_BLOCKS,
  MAX_DOC_GENERATION_RETRIEVAL_LIMIT,
  MAX_DOC_GENERATION_TEMPERATURE,
  MIN_BLOCK_ENRICH_BATCH_BLOCKS,
  MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS,
  MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS,
  MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK,
  MIN_CALENDAR_UPCOMING_DAYS,
  MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS,
  MIN_DOC_GENERATION_REFERENCE_BLOCKS,
  MIN_DOC_GENERATION_RETRIEVAL_LIMIT,
  MIN_DOC_GENERATION_TEMPERATURE,
} from '../../shared/config'
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
} from '../../shared/types'
import { useI18n } from '../i18n/useI18n'
import { formatDateByLanguage, formatNumberByLanguage, getLanguageFromUISettings, getLanguageLabel, withRendererLanguage, type AppLanguage } from '../i18n/locale'
import { ActionButton } from './ui/ActionButton'
import { useToast } from './toast-context'

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

type SettingsSectionId = 'about' | 'general' | 'ai' | 'external-access' | 'backup' | 'files' | 'advanced'

type SettingsNavGroup = {
  title: string
  items: Array<{
    id: SettingsSectionId
    label: string
    hint: string
  }>
}

function buildSettingsNavGroups(language: AppLanguage): SettingsNavGroup[] {
  if (language === 'en') {
    return [
      {
        title: 'Options',
        items: [
          { id: 'about', label: 'About', hint: 'Runtime status and diagnostics' },
          { id: 'general', label: 'General', hint: 'Daily feature switches' },
          { id: 'ai', label: 'Model & API', hint: 'LLM / Embedding' },
          { id: 'external-access', label: 'External Access', hint: 'CLI and generic integrations' },
          { id: 'files', label: 'Files', hint: 'Open data and settings folders' },
        ],
      },
      {
        title: 'Maintenance',
        items: [
          { id: 'backup', label: 'Backup', hint: 'Export and import backup' },
          { id: 'advanced', label: 'Advanced', hint: 'Low-frequency tuning' },
        ],
      },
    ]
  }

  return [
    {
      title: '选项',
      items: [
        { id: 'about', label: '关于', hint: '运行状态与诊断' },
        { id: 'general', label: '常用', hint: '日常功能开关' },
        { id: 'ai', label: '模型与接口', hint: 'LLM / Embedding' },
        { id: 'external-access', label: '外部接入', hint: 'CLI 与通用接入' },
        { id: 'files', label: '文件与目录', hint: '打开数据与设置' },
      ],
    },
    {
      title: '维护',
      items: [
        { id: 'backup', label: '备份与恢复', hint: '导出与加载备份' },
        { id: 'advanced', label: '高级设置', hint: '低频参数调优' },
      ],
    },
  ]
}

function SettingField({
  label,
  value,
  placeholder,
  onChange,
  secret = false,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  secret?: boolean
}) {
  return (
    <label className="block w-full max-w-[420px] space-y-1.5">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      />
    </label>
  )
}

function SettingNumberField({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block w-full max-w-[240px] space-y-1.5">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          onChange(Number.isFinite(nextValue) ? nextValue : value)
        }}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      />
      <p className="text-xs leading-5 text-stone-500">{description}</p>
    </label>
  )
}

function SettingSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label={label}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked)
        }
      }}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-violet-500' : 'bg-stone-300'
      } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  testId?: string
}) {
  return (
    <label className="block w-full min-w-[180px] space-y-1.5">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string
  description: ReactNode
  control?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 py-5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-stone-900">{title}</div>
        <div className="mt-1 text-sm leading-6 text-stone-500">{description}</div>
      </div>
      {control ? <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div> : null}
    </div>
  )
}

function SettingsGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="pt-2">
      <h3 className="mb-3 text-[13px] font-semibold text-stone-900">{title}</h3>
      <div>{children}</div>
    </section>
  )
}

function formatCompactStat(value: number, language: AppLanguage): string {
  return formatNumberByLanguage(value, language)
}

function formatExternalAccessTime(value: string | null, language: AppLanguage): string {
  if (!value) {
    return language === 'en' ? 'not generated' : '尚未生成'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : formatDateByLanguage(date, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }, language)
}

function renderMonospaceValue(value: string): ReactNode {
  return <span className="break-all font-mono text-[12px] text-stone-600">{value}</span>
}

function normalizeTokenUsage(usage: TokenUsage | null | undefined): TokenUsage {
  return usage ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
  }
}

function TokenUsagePanel({
  title,
  hint,
  usage,
  language,
}: {
  title: string
  hint: string
  usage: TokenUsage | null | undefined
  language: AppLanguage
}) {
  const normalizedUsage = normalizeTokenUsage(usage)
  const hasUsage = normalizedUsage.requestCount > 0

  return (
    <section className="overflow-hidden border border-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-stone-900">{title}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-stone-500">{hint}</div>
        </div>
        <div className="text-[11px] font-medium text-stone-400">{hasUsage ? (language === 'en' ? `${formatCompactStat(normalizedUsage.requestCount, language)} requests` : `${formatCompactStat(normalizedUsage.requestCount, language)} 次请求`) : (language === 'en' ? 'No calls yet' : '暂无调用')}</div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-stone-200">
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{language === 'en' ? 'REQUESTS' : '请求'}</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.requestCount, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Prompt</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.promptTokens, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Completion</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.completionTokens, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Total</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.totalTokens, language)}</div>
        </div>
      </div>
    </section>
  )
}

function NavIcon({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case 'about':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 13v-3" />
          <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'general':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h12" />
          <path d="M4 6h12" />
          <path d="M4 14h8" />
        </svg>
      )
    case 'ai':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3v4" />
          <path d="M10 13v4" />
          <path d="M3 10h4" />
          <path d="M13 10h4" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      )
    case 'external-access':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5h3" />
          <path d="M10.5 13.5h3" />
          <path d="M9.5 10.5 6.5 13.5" />
          <path d="M10.5 9.5 13.5 6.5" />
          <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
        </svg>
      )
    case 'backup':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h7L16 8.5V14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 13.5Z" />
          <path d="M12.5 5v3.5H16" />
          <path d="M10 8.5v4" />
          <path d="m8.5 11 1.5 1.5L11.5 11" />
        </svg>
      )
    case 'files':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6.5h5l1.5 1.5h6A1.5 1.5 0 0 1 17.5 9.5v5A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z" />
        </svg>
      )
    case 'advanced':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3.5v2" />
          <path d="M10 14.5v2" />
          <path d="m14.95 5.05-1.4 1.4" />
          <path d="m6.45 13.55-1.4 1.4" />
          <path d="M16.5 10h-2" />
          <path d="M5.5 10h-2" />
          <path d="m14.95 14.95-1.4-1.4" />
          <path d="m6.45 6.45-1.4-1.4" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      )
  }
}

function localize(language: AppLanguage, zh: string, en: string): string {
  return language === 'en' ? en : zh
}

function SettingsNavButton({
  section,
  label,
  hint,
  active,
  badge,
  onClick,
  testId,
}: {
  section: SettingsSectionId
  label: string
  hint: string
  active: boolean
  badge?: string
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${
        active ? 'bg-stone-200/80 text-stone-900' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">{NavIcon({ section })}</span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{label}</span>
        </span>
      </span>
      {badge ? <span className="rounded-full bg-stone-300 px-2 py-0.5 text-[10px] font-semibold text-stone-700">{badge}</span> : null}
      <span className="sr-only">{hint}</span>
    </button>
  )
}

function runtimeAiStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta?.aiConfigured) {
    return localize(language, '未配置，当前使用 mock', 'Not configured. Using mock.')
  }

  if (meta.activeAiMode === 'live') {
    return meta.lastAiError
      ? localize(language, 'live AI 已启用，但最近运行失败', 'Live AI is enabled, but the latest run failed.')
      : localize(language, 'live AI 已启用', 'Live AI is enabled.')
  }

  return localize(language, '配置已保存，但当前仍停留在 mock', 'Config is saved, but the app is still in mock mode.')
}

function runtimeVectorStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta?.vectorReady) {
    return localize(language, '已降级：搜索仍可用，但仅标签 + FTS，不走向量召回', 'Degraded: search still works, but only via tags + FTS without vector recall.')
  }

  if (!meta.vectorSchemaReady) {
    return localize(language, '向量可用，但 Schema 仍在准备', 'Vectors are available, but the schema is still being prepared.')
  }

  return localize(language, `可用 · ${meta.vectorDimension ?? '?'} 维`, `Ready · ${meta.vectorDimension ?? '?'} dim`)
}

function runtimeQueueStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta) {
    return localize(language, '加载中…', 'Loading…')
  }

  if (meta.failedVectorCount > 0) {
    return localize(language, `失败待重试 · ${meta.failedVectorCount} 个块`, `Failed and waiting for retry · ${meta.failedVectorCount} blocks`)
  }

  if (meta.pendingVectorCount > 0) {
    return meta.vectorQueueProcessing
      ? localize(language, `处理中 · ${meta.pendingVectorCount} 个待补齐`, `Processing · ${meta.pendingVectorCount} pending`)
      : localize(language, `积压中 · ${meta.pendingVectorCount} 个待补齐`, `Backlogged · ${meta.pendingVectorCount} pending`)
  }

  return localize(language, '正常', 'Normal')
}

function rebuildAllVectorsDisabledReason(meta: AppMeta | null, language: AppLanguage): string | null {
  if (!meta) {
    return localize(language, '正在加载当前状态。', 'Loading current status.')
  }

  if (!meta.vectorReady) {
    return localize(language, '当前数据库未启用向量索引。', 'Vector index is not enabled for the current database.')
  }

  if (meta.aiConfigured && meta.activeAiMode !== 'live') {
    return localize(language, '已配置 AI 但尚未完成测试，请先完成连接测试。', 'AI is configured but not verified yet. Run a connection test first.')
  }

  return null
}

function countAdvancedOverrides(
  docGenerationSettings: DocGenerationSettings,
  blockEnrichSettings: BlockEnrichSettings,
  calendarSettings: CalendarSettings,
): number {
  let count = 0

  if (docGenerationSettings.maxReferenceBlocks !== DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks) count += 1
  if (docGenerationSettings.retrievalLimit !== DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit) count += 1
  if (docGenerationSettings.temperature !== DEFAULT_DOC_GENERATION_SETTINGS.temperature) count += 1
  if (docGenerationSettings.maxOutputTokens !== DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens) count += 1
  if (docGenerationSettings.streamOutput !== DEFAULT_DOC_GENERATION_SETTINGS.streamOutput) count += 1
  if (blockEnrichSettings.queueEnabled !== DEFAULT_BLOCK_ENRICH_SETTINGS.queueEnabled) count += 1
  if (blockEnrichSettings.maxBatchBlocks !== DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks) count += 1
  if (blockEnrichSettings.queueDebounceMs !== DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs) count += 1
  if (blockEnrichSettings.responseReserveTokens !== DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens) count += 1
  if (calendarSettings.maxSuggestionsPerBlock !== DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock) count += 1
  if (calendarSettings.upcomingDays !== DEFAULT_CALENDAR_SETTINGS.upcomingDays) count += 1

  return count
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
  const isEn = language === 'en'
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

  const pageTitle = useMemo(() => {
    if (language === 'en') {
      switch (activeSection) {
        case 'about':
          return { eyebrow: 'About', title: 'App info and runtime status', description: 'Browse current status, latest tests, and diagnostics from one place.' }
        case 'general':
          return { eyebrow: 'General', title: 'Common features', description: 'Keep daily switches here and avoid diving into advanced settings.' }
        case 'ai':
          return { eyebrow: 'Model & API', title: 'Model and API', description: 'Configure LLM / Embedding, then test manually after saving.' }
        case 'external-access':
          return { eyebrow: 'External Access', title: 'External access', description: 'Operate first, check paths second. Generates generic integration bundle by default.' }
        case 'backup':
          return { eyebrow: 'Backup', title: 'Backup and restore', description: 'Export full JSON backups, or preview and import past backups.' }
        case 'files':
          return { eyebrow: 'Files', title: 'Files and directories', description: 'Open data and settings directories directly for troubleshooting.' }
        case 'advanced':
          return { eyebrow: 'Advanced', title: 'Advanced settings', description: 'Low-frequency tuning and maintenance tools live here.' }
      }
    }

    switch (activeSection) {
      case 'about':
        return { eyebrow: '关于', title: '应用信息与运行状态', description: '像系统设置一样浏览当前状态、最近测试结果和运行诊断。' }
      case 'general':
        return { eyebrow: '常用', title: '常用功能', description: '把日常会用到的功能开关留在外层，避免先钻进高级参数。' }
      case 'ai':
        return { eyebrow: '模型与接口', title: '模型与接口', description: '配置 LLM / Embedding，并在保存后手动测试连接。' }
      case 'external-access':
        return { eyebrow: '外部接入', title: '外部接入', description: '先操作，再看路径。这里默认生成通用接入包，Claude 只是附带模板。' }
      case 'backup':
        return { eyebrow: '备份与恢复', title: '备份与恢复', description: '导出完整 JSON 备份，或预览后加载历史备份。' }
      case 'files':
        return { eyebrow: '文件与目录', title: '文件与目录', description: '直接打开数据目录和设置文件目录，便于排查和手动复制。' }
      case 'advanced':
        return { eyebrow: '高级设置', title: '高级设置', description: '低频参数和维护工具都收在这里，只在需要调优或维护时再打开。' }
    }
  }, [activeSection, language])

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
        return (
          <div className="space-y-10">
            <SettingsGroup title="运行与索引">
              <SettingsRow
                title={localize(language, '应用状态', 'App status')}
                description={localize(language, '这里集中显示当前 AI / 向量状态、最近测试结果和后台运行情况，不再在数据管理里重复出现。', 'Current AI / vector status, latest test results, and runtime diagnostics are summarized here instead of being duplicated elsewhere.')}
                control={
                  <div className="text-right text-sm text-stone-500">
                    <div className="font-semibold text-stone-900">{localize(language, '长布桌面版', 'Changbu Desktop')}</div>
                    <div>{localize(language, '数据目录已连接', 'Data directory connected')}</div>
                  </div>
                }
              />
              <SettingsRow title={localize(language, 'AI 模式', 'AI mode')} description={runtimeAiStatus(meta, language)} />
              <SettingsRow title={localize(language, '向量状态', 'Vector status')} description={runtimeVectorStatus(meta, language)} />
              <SettingsRow title={localize(language, '队列状态', 'Queue status')} description={runtimeQueueStatus(meta, language)} />
              <SettingsRow title="Base URL" description={meta?.resolvedBaseUrl ?? localize(language, '尚未解析', 'Not resolved yet')} />
              <SettingsRow
                title={localize(language, '最近测试', 'Latest test')}
                description={
                  meta?.lastAiTestResult
                    ? `${meta.lastAiTestResult.success ? localize(language, '测试通过', 'Passed') : localize(language, '测试失败', 'Failed')} · ${formatDateByLanguage(meta.lastAiTestResult.checkedAt, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    }, language)}`
                    : localize(language, '还没有 API 测试记录。', 'No API test record yet.')
                }
              />
              <SettingsRow title={localize(language, '待处理向量', 'Pending vectors')} description={localize(language, `${meta?.pendingVectorCount ?? 0} 个`, `${meta?.pendingVectorCount ?? 0}`)} />
              <SettingsRow title={localize(language, '失败向量', 'Failed vectors')} description={localize(language, `${meta?.failedVectorCount ?? 0} 个`, `${meta?.failedVectorCount ?? 0}`)} />
              {meta?.lastAiError ? <SettingsRow title={localize(language, '最近运行错误', 'Latest runtime error')} description={meta.lastAiError} /> : null}
            </SettingsGroup>

            <SettingsGroup title={localize(language, 'Token 使用', 'Token usage')}>
              <div className="grid gap-3 lg:grid-cols-2">
                <TokenUsagePanel
                  title={language === 'en' ? 'Current session' : '当前会话'}
                  hint={language === 'en' ? 'Usage collected since this app launch.' : '本次启动后的调用统计。'}
                  usage={meta?.tokenUsage}
                  language={language}
                />
                <TokenUsagePanel
                  title={language === 'en' ? 'Lifetime total' : '累计总计'}
                  hint={language === 'en' ? 'Cumulative usage persisted across restarts.' : '跨重启累计保存的总用量。'}
                  usage={meta?.lifetimeTokenUsage}
                  language={language}
                />
              </div>
            </SettingsGroup>
          </div>
        )
      case 'general':
        return (
          <SettingsGroup title={localize(language, '功能开关', 'Feature switches')}>
            <SettingsRow
              title={localize(language, '启用 AI 日期建议', 'Enable AI date suggestions')}
              description={localize(language, '块 enrich 完成后，若内容里有明确未来日期安排，会在日历里生成 AI 建议；开启自动加入后会直接成为正式安排。', 'After block enrichment finishes, Changbu can turn clear future plans into calendar suggestions. If auto-add is on, those suggestions become real entries immediately.')}
              control={
                <SettingSwitch
                  label={localize(language, '启用 AI 日期建议', 'Enable AI date suggestions')}
                  checked={calendarSettings.aiSuggestionsEnabled}
                  onChange={(checked) => {
                    onCalendarSettingsChange({
                      ...calendarSettings,
                      aiSuggestionsEnabled: checked,
                    })
                  }}
                />
              }
            />
            <SettingsRow
              title={localize(language, 'AI 建议自动加入日历', 'Auto-add AI suggestions to calendar')}
              description={calendarSettings.aiSuggestionsEnabled
                ? localize(language, '识别到明确的未来安排后，直接创建正式日历事项，不再等待手动确认。', 'When a future plan is clearly recognized, create a real calendar entry immediately instead of waiting for manual confirmation.')
                : localize(language, '先启用 AI 日期建议后，才可以打开自动加入。', 'Enable AI date suggestions first before turning on auto-add.')}
              control={
                <SettingSwitch
                  label={localize(language, 'AI 建议自动加入日历', 'Auto-add AI suggestions to calendar')}
                  checked={calendarSettings.autoAcceptAiSuggestions}
                  disabled={!calendarSettings.aiSuggestionsEnabled}
                  onChange={(checked) => {
                    onCalendarSettingsChange({
                      ...calendarSettings,
                      autoAcceptAiSuggestions: checked,
                    })
                  }}
                />
              }
            />
            <SettingsRow
              title={localize(language, '显示左侧时间线', 'Show left-side mini timeline')}
              description={localize(language, '在时间轴页左侧显示极简日期时间线，并随滚动高亮当前所在日期。', 'Show a compact date timeline on the left side of Timeline and highlight the current day while scrolling.')}
              control={
                <SettingSwitch
                  label={localize(language, '显示左侧时间线', 'Show left-side mini timeline')}
                  checked={uiSettings.showMiniTimeline}
                  onChange={(checked) => {
                    onUISettingsChange({
                      ...uiSettings,
                      showMiniTimeline: checked,
                    })
                  }}
                />
              }
            />
            <SettingsRow
              title={t('settings.general.languageLabel')}
              description={t('settings.general.languageHint')}
              control={
                <SettingSelect
                  label={t('settings.general.languageLabel')}
                  value={getLanguageFromUISettings(uiSettings)}
                  testId={t('settings.language.selectTestId')}
                  options={[
                    { value: 'zh', label: getLanguageLabel('zh', language) },
                    { value: 'en', label: getLanguageLabel('en', language) },
                  ]}
                  onChange={(nextLanguage) => {
                    onUISettingsChange(withRendererLanguage(uiSettings, nextLanguage === 'en' ? 'en' : 'zh') as UISettings)
                  }}
                />
              }
            />
          </SettingsGroup>
        )
      case 'ai':
        return (
          <div className="space-y-10">
            <SettingsGroup title="LLM">
              <SettingsRow
                title="Endpoint"
                description={localize(language, '用于摘要、文档生成与 AI 写作流程。', 'Used for summaries, document generation, and AI writing flows.')}
                control={
                  <SettingField
                    label="Endpoint"
                    value={config.llm.endpoint}
                    placeholder="https://api.openai.com/v1"
                    onChange={(value) => onChange({ ...config, llm: { ...config.llm, endpoint: value } })}
                  />
                }
              />
              <SettingsRow
                title="API Key"
                description={localize(language, '保存后会写入本地设置文件。', 'Saved into the local settings file after you click save.')}
                control={
                  <SettingField
                    label="API Key"
                    value={config.llm.apiKey}
                    placeholder="sk-..."
                    secret
                    onChange={(value) => onChange({ ...config, llm: { ...config.llm, apiKey: value } })}
                  />
                }
              />
              <SettingsRow
                title="Model"
                description={localize(language, '例如 gpt-4o-mini。', 'For example, gpt-4o-mini.')}
                control={
                  <SettingField
                    label="Model"
                    value={config.llm.model}
                    placeholder="gpt-4o-mini"
                    onChange={(value) => onChange({ ...config, llm: { ...config.llm, model: value } })}
                  />
                }
              />
              <SettingsRow
                title={t('settings.ai.multimodalLabel')}
                description={`${t('settings.ai.multimodalHint')} · ${multimodalStatusLabel}`}
                control={
                  <SettingSwitch
                    label={t('settings.ai.multimodalLabel')}
                    checked={config.multimodalImageAnalysisEnabled}
                    onChange={(checked) => onChange({ ...config, multimodalImageAnalysisEnabled: checked })}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title="Embedding">
              <SettingsRow
                title="Endpoint"
                description={localize(language, '用于向量检索、连接图和语义召回。', 'Used for vector search, graph relationships, and semantic recall.')}
                control={
                  <SettingField
                    label="Endpoint"
                    value={config.embedding.endpoint}
                    placeholder="https://api.openai.com/v1"
                    onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, endpoint: value } })}
                  />
                }
              />
              <SettingsRow
                title="API Key"
                description={localize(language, '如需单独的 embedding 提供方，可与 LLM 使用不同密钥。', 'If you use a separate embedding provider, it can use a different key from the LLM.')}
                control={
                  <SettingField
                    label="API Key"
                    value={config.embedding.apiKey}
                    placeholder="sk-..."
                    secret
                    onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, apiKey: value } })}
                  />
                }
              />
              <SettingsRow
                title="Model"
                description={localize(language, '例如 text-embedding-3-small。', 'For example, text-embedding-3-small.')}
                control={
                  <SettingField
                    label="Model"
                    value={config.embedding.model}
                    placeholder="text-embedding-3-small"
                    onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, model: value } })}
                  />
                }
              />
            </SettingsGroup>
          </div>
        )
      case 'external-access':
        return (
          <div className="space-y-10">
            <SettingsGroup title={localize(language, '快速操作', 'Quick actions')}>
              <SettingsRow
                title={localize(language, '接入开关', 'Access switch')}
                description={
                  externalAccessStatus
                    ? externalAccessStatus.enabled
                      ? localize(language, '当前已启用。CLI 在执行真实读写前会检查这个状态。', 'Currently enabled. The CLI checks this state before performing real reads or writes.')
                      : localize(language, '当前未启用。先启用，外部工具才可以真正读写长布内容。', 'Currently disabled. Enable it first so external tools can actually read and write Changbu data.')
                    : localize(language, '正在读取外部接入状态。', 'Loading external access status.')
                }
                control={
                  <>
                    <ActionButton
                      primary
                      disabled={externalAccessBusy || externalAccessStatus?.enabled === true}
                      onClick={() => {
                        void onEnableExternalAccess()
                      }}
                      testId="settings-enable-external-access"
                    >
                      {externalAccessBusyAction === 'enable' ? localize(language, '启用中…', 'Enabling…') : localize(language, '启用接入', 'Enable access')}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy || !externalAccessStatus?.enabled}
                      onClick={() => {
                        void onDisableExternalAccess()
                      }}
                      testId="settings-disable-external-access"
                    >
                      {externalAccessBusyAction === 'disable' ? localize(language, '停用中…', 'Disabling…') : localize(language, '停用接入', 'Disable access')}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy}
                      onClick={() => {
                        void onRefreshExternalAccess()
                      }}
                      testId="settings-refresh-external-access"
                    >
                      {externalAccessBusyAction === 'refresh' ? localize(language, '刷新中…', 'Refreshing…') : localize(language, '刷新状态', 'Refresh status')}
                    </ActionButton>
                  </>
                }
              />
              <SettingsRow
                title={localize(language, '生成接入包', 'Generate bundle')}
                description={localize(language, '生成物统一放在长布自己的接入目录里。你要给 Claude、Codex 或别的工具用，都从这里拿。', 'All generated files live in Changbu’s own external-access directory. Use this bundle for Claude, Codex, or any other tool.')}
                control={
                  <>
                    <ActionButton
                      primary
                      disabled={externalAccessBusy}
                      onClick={() => {
                        void onGenerateExternalAccessBundle()
                      }}
                      testId="settings-generate-external-access"
                    >
                      {externalAccessBusyAction === 'generate' ? localize(language, '生成中…', 'Generating…') : externalAccessStatus?.generatedAt ? localize(language, '重新生成接入包', 'Regenerate bundle') : localize(language, '生成接入包', 'Generate bundle')}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy || !externalAccessStatus}
                      onClick={() => {
                        void onOpenExternalAccessDirectory()
                      }}
                      testId="settings-open-external-access-directory"
                    >
                      {externalAccessBusyAction === 'open' ? localize(language, '打开中…', 'Opening…') : localize(language, '打开接入目录', 'Open bundle directory')}
                    </ActionButton>
                    <ActionButton
                      disabled={!externalAccessStatus}
                      onClick={() => {
                        void copyExternalAccessCommand()
                      }}
                      testId="settings-copy-external-access-command"
                    >
                      {localize(language, '复制示例查询命令', 'Copy sample search command')}
                    </ActionButton>
                  </>
                }
              />
              <SettingsRow
                title={localize(language, '当前结果', 'Current result')}
                description={
                  externalAccessStatus
                    ? [
                        `${localize(language, '接入', 'Access')}: ${externalAccessStatus.enabled ? localize(language, '已启用', 'enabled') : localize(language, '未启用', 'disabled')}`,
                        `CLI: ${externalAccessStatus.cliExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                        `${localize(language, '总说明', 'README')}: ${externalAccessStatus.integrationReadmeExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                        `${localize(language, '通用规则', 'AGENTS')}: ${externalAccessStatus.agentGuideExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                        `${localize(language, '适配器', 'Adapters')}: ${externalAccessStatus.skillExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                      ].join(' · ')
                    : localize(language, '正在读取状态。', 'Loading status.')
                }
              />
            </SettingsGroup>

            <SettingsGroup title={localize(language, '生成产物', 'Generated files')}>
              <SettingsRow
                title={localize(language, '接入包目录', 'Bundle directory')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliDirectory) : localize(language, '生成后会显示接入包根目录。', 'The bundle root directory appears after generation.')}
              />
              <SettingsRow
                title={localize(language, 'CLI 路径', 'CLI path')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliPath) : localize(language, '生成后会显示本地 CLI 包装脚本路径。', 'The local CLI wrapper path appears after generation.')}
              />
              <SettingsRow
                title="README"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.integrationReadmePath) : localize(language, '生成后会显示通用接入说明 README。', 'The shared integration README appears after generation.')}
              />
              <SettingsRow
                title="AGENTS"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.agentGuidePath) : localize(language, '生成后会显示可复用的 AGENTS.md 提示文件。', 'A reusable AGENTS.md prompt file appears after generation.')}
              />
              <SettingsRow
                title={localize(language, '命令说明', 'Commands guide')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.commandsGuidePath) : localize(language, '生成后会显示 CLI 命令说明。', 'The CLI commands guide appears after generation.')}
              />
              <SettingsRow
                title={localize(language, '工作流说明', 'Workflow guide')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.workflowsGuidePath) : localize(language, '生成后会显示检索与写入工作流说明。', 'The search and write workflow guide appears after generation.')}
              />
              <SettingsRow
                title={localize(language, '示例目录', 'Examples directory')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.examplesDirectory) : localize(language, '生成后会显示 examples 目录。', 'The examples directory appears after generation.')}
              />
              <SettingsRow
                title={localize(language, '适配器目录', 'Adapters directory')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.adaptersDirectory) : localize(language, '生成后会显示 adapters 目录。', 'The adapters directory appears after generation.')}
              />
              <SettingsRow
                title={localize(language, 'Claude 模板目录', 'Claude template directory')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.skillDirectory) : localize(language, '生成后会显示 Claude 模板目录。', 'The Claude template directory appears after generation.')}
              />
              <SettingsRow
                title={localize(language, '可执行文件', 'Executable')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.executablePath) : localize(language, '加载中…', 'Loading…')}
              />
              <SettingsRow
                title={localize(language, '最近生成时间', 'Last generated')}
                description={formatExternalAccessTime(externalAccessStatus?.generatedAt ?? null, language)}
              />
              <SettingsRow
                title={localize(language, '自检命令', 'Doctor command')}
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.doctorCommand) : localize(language, '生成后会显示 doctor 命令。', 'The doctor command appears after generation.')}
              />
            </SettingsGroup>

            <SettingsGroup title={localize(language, '问题与说明', 'Issues and notes')}>
              <SettingsRow
                title={localize(language, '当前问题', 'Current issues')}
                description={
                  externalAccessStatus
                    ? externalAccessStatus.issues.length > 0
                      ? (
                        <ul className="space-y-1">
                          {externalAccessStatus.issues.map((issue) => (
                            <li key={issue}>• {issue}</li>
                          ))}
                        </ul>
                      )
                      : localize(language, '没有检测到问题。', 'No issues detected.')
                    : localize(language, '正在读取状态。', 'Loading status.')
                }
              />
              <SettingsRow
                title={localize(language, '说明', 'Notes')}
                description={localize(language, '这里默认生成的是完整通用接入包：包含 guides、examples 和 adapters。Claude 只是 adapters 里的一个模板，不再自动塞进它自己的目录。外部 CLI 目前支持 search、tag、get、list、create、update、remove、tags、doctor。', 'By default this generates a full generic bundle with guides, examples, and adapters. Claude is only one template inside adapters and is no longer copied into its own directory automatically. The external CLI currently supports search, tag, get, list, create, update, remove, tags, and doctor.')}
              />
            </SettingsGroup>
          </div>
        )
      case 'backup':
        return (
          <div className="space-y-10">
            <SettingsGroup title={localize(language, '备份', 'Backups')}>
              <SettingsRow
                title={localize(language, '创建备份', 'Create backup')}
                description={localize(language, '导出当前块数据、附件和设置快照，适合完整迁移、归档和手动留档。', 'Export current blocks, attachments, and settings snapshots for migration, archiving, or manual safekeeping.')}
                control={
                  <ActionButton primary onClick={() => { void onCreateBackup() }} testId="settings-create-backup">
                    {localize(language, '创建备份', 'Create backup')}
                  </ActionButton>
                }
              />
              <SettingsRow
                title={localize(language, '加载备份', 'Load backup')}
                description={localize(language, '读取 JSON 备份并先展示预览，再决定如何处理冲突。', 'Read a JSON backup, inspect the preview first, then decide how to handle conflicts.')}
                control={
                  <ActionButton onClick={() => { void onLoadBackupPreview() }} testId="settings-load-backup">
                    {localize(language, '加载备份', 'Load backup')}
                  </ActionButton>
                }
              />
            </SettingsGroup>

            {importPreview ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4" data-testid="settings-import-preview">
                <div className="text-sm font-semibold text-amber-900">{localize(language, '备份预览', 'Backup preview')}</div>
                <div className="mt-1 text-xs leading-5 text-amber-800">
                  {isEn
                    ? `${importPreview.format.toUpperCase()} · ${importPreview.totalFiles} files / ${importPreview.totalBlocks} blocks · ${importPreview.conflicts} conflicts`
                    : `${importPreview.format.toUpperCase()} · ${importPreview.totalFiles} 个文件 / ${importPreview.totalBlocks} 个块 · 冲突 ${importPreview.conflicts}`}
                </div>
                {importPreview.includesSettings ? (
                  <div className="mt-1 text-xs leading-5 text-amber-800">
                    {isEn
                      ? `Includes settings snapshot · ${importPreview.settingsEntryCount ?? 0} settings entries will be restored during import`
                      : `含设置快照 · ${importPreview.settingsEntryCount ?? 0} 项设置会在导入时一并恢复`}
                  </div>
                ) : null}
                <div className="mt-3 space-y-1 text-xs text-amber-800">
                  {importPreview.samples.map((sample) => (
                    <p key={`${sample.filename}-${sample.preview}`}>{sample.filename}{isEn ? ': ' : '：'}{sample.preview}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {importPreview.conflicts > 0 ? (
                    <>
                      <ActionButton onClick={() => { void onConfirmImport('skip_all') }}>
                        {localize(language, '全部跳过冲突', 'Skip all conflicts')}
                      </ActionButton>
                      <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                        {localize(language, '全部覆盖冲突', 'Overwrite all conflicts')}
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                      {localize(language, '确认导入', 'Confirm import')}
                    </ActionButton>
                  )}
                  <ActionButton onClick={onDismissImportPreview}>{localize(language, '取消', 'Cancel')}</ActionButton>
                </div>
              </section>
            ) : null}
          </div>
        )
      case 'files':
        return (
          <SettingsGroup title={localize(language, '本地文件', 'Local files')}>
            <SettingsRow
              title={localize(language, '打开数据目录', 'Open data directory')}
              description={localize(language, '查看数据库、附件等运行数据。', 'Inspect runtime data such as the database and attachments.')}
              control={
                <ActionButton
                  onClick={() => {
                    void runFileAction('data-directory', onOpenDataDirectory, localize(language, '打开数据目录失败。', 'Failed to open data directory.'))
                  }}
                  disabled={fileActionPending !== null}
                >
                  {localize(language, '打开数据目录', 'Open data directory')}
                </ActionButton>
              }
            />
            <SettingsRow
              title={localize(language, '打开设置文件目录', 'Open settings directory')}
              description={localize(language, '查看 changbu-settings.json 等持久化配置文件。', 'Inspect persisted config files such as changbu-settings.json.')}
              control={
                <ActionButton
                  onClick={() => {
                    void runFileAction('settings-directory', onOpenSettingsDirectory, localize(language, '打开设置文件目录失败。', 'Failed to open settings directory.'))
                  }}
                  disabled={fileActionPending !== null}
                >
                  {localize(language, '打开设置文件目录', 'Open settings directory')}
                </ActionButton>
              }
            />
          </SettingsGroup>
        )
      case 'advanced':
        return (
          <div className="space-y-10" data-testid="settings-advanced-panel">
            <SettingsGroup title={localize(language, '文档生成', 'Document generation')}>
              <SettingsRow
                title={localize(language, '最大引用块数', 'Max reference blocks')}
                description={isEn
                  ? `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}. Automatically clamped to ${MIN_DOC_GENERATION_REFERENCE_BLOCKS}–${MAX_DOC_GENERATION_REFERENCE_BLOCKS} when saved.`
                  : `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}，保存时会自动限制在 ${MIN_DOC_GENERATION_REFERENCE_BLOCKS} 到 ${MAX_DOC_GENERATION_REFERENCE_BLOCKS} 之间。`}
                control={
                  <SettingNumberField
                    label={localize(language, '最大引用块数', 'Max reference blocks')}
                    value={docGenerationSettings.maxReferenceBlocks}
                    min={MIN_DOC_GENERATION_REFERENCE_BLOCKS}
                    max={MAX_DOC_GENERATION_REFERENCE_BLOCKS}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        maxReferenceBlocks: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '召回候选块数', 'Candidate recall limit')}
                description={localize(language, '生成前先从搜索结果里取这么多候选块，再筛选引用。', 'Pull this many candidate blocks from search before filtering references.')}
                control={
                  <SettingNumberField
                    label={localize(language, '召回候选块数', 'Candidate recall limit')}
                    value={docGenerationSettings.retrievalLimit}
                    min={MIN_DOC_GENERATION_RETRIEVAL_LIMIT}
                    max={MAX_DOC_GENERATION_RETRIEVAL_LIMIT}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        retrievalLimit: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '生成温度', 'Generation temperature')}
                description={localize(language, '越低越稳，越高越发散。建议 0 到 0.4。', 'Lower is more stable; higher is more divergent. Recommended: 0 to 0.4.')}
                control={
                  <SettingNumberField
                    label={localize(language, '生成温度', 'Generation temperature')}
                    value={docGenerationSettings.temperature}
                    min={MIN_DOC_GENERATION_TEMPERATURE}
                    max={MAX_DOC_GENERATION_TEMPERATURE}
                    step={0.05}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        temperature: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '模型流式输出', 'Streaming output')}
                description={localize(language, '开启后，每日回顾和 AI 洞察会边生成边显示；关闭后等待完整结果再展示。', 'When enabled, Daily Review and AI Insights render while generating. When disabled, they wait for the full result.')}
                control={
                  <SettingSwitch
                    label={localize(language, '模型流式输出', 'Streaming output')}
                    checked={docGenerationSettings.streamOutput}
                    onChange={(checked) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        streamOutput: checked,
                      })
                    }}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '输出 Token 上限', 'Max output tokens')}
                description={localize(language, '限制单次文档生成的输出长度与成本。', 'Cap output length and cost for a single generation run.')}
                control={
                  <SettingNumberField
                    label={localize(language, '输出 Token 上限', 'Max output tokens')}
                    value={docGenerationSettings.maxOutputTokens}
                    min={MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS}
                    max={MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        maxOutputTokens: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}`)}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title={localize(language, '块 enrich', 'Block enrich')}>
              <SettingsRow
                title={localize(language, '启用 live enrich 队列', 'Enable live enrich queue')}
                description={localize(language, '仅对已启用的 live AI 生效。创建多个块时会先短暂聚合，再合并请求，以减少调用次数和费用。', 'Only applies when live AI is enabled. Multiple new blocks are briefly batched together to reduce request count and cost.')}
                control={
                  <SettingSwitch
                    label={localize(language, '启用 live enrich 队列', 'Enable live enrich queue')}
                    checked={blockEnrichSettings.queueEnabled}
                    onChange={(checked) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        queueEnabled: checked,
                      })
                    }}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '单次最多合并块数', 'Max blocks per batch')}
                description={isEn
                  ? `Automatically clamped to ${MIN_BLOCK_ENRICH_BATCH_BLOCKS}–${MAX_BLOCK_ENRICH_BATCH_BLOCKS} when saved.`
                  : `保存时会自动限制在 ${MIN_BLOCK_ENRICH_BATCH_BLOCKS} 到 ${MAX_BLOCK_ENRICH_BATCH_BLOCKS} 之间。`}
                control={
                  <SettingNumberField
                    label={localize(language, '单次最多合并块数', 'Max blocks per batch')}
                    value={blockEnrichSettings.maxBatchBlocks}
                    min={MIN_BLOCK_ENRICH_BATCH_BLOCKS}
                    max={MAX_BLOCK_ENRICH_BATCH_BLOCKS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        maxBatchBlocks: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '聚合等待时间', 'Batch wait time')}
                description={localize(language, '达到块数上限前，会最多等待这段时间再一起发送。', 'Before reaching the block cap, requests wait up to this long before being sent together.')}
                control={
                  <SettingNumberField
                    label={localize(language, '聚合等待时间', 'Batch wait time')}
                    value={blockEnrichSettings.queueDebounceMs}
                    min={MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
                    max={MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        queueDebounceMs: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs} ms`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs} ms`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '预留输出 Token', 'Reserved output tokens')}
                description={localize(language, '批量请求会先按模型上下文估算，再预留这部分空间给返回结果。', 'Batch requests estimate model context first, then reserve this amount of space for the response.')}
                control={
                  <SettingNumberField
                    label={localize(language, '预留输出 Token', 'Reserved output tokens')}
                    value={blockEnrichSettings.responseReserveTokens}
                    min={MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
                    max={MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        responseReserveTokens: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}`)}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title={localize(language, '日历窗口', 'Calendar window')}>
              <SettingsRow
                title={localize(language, '每块最多建议条数', 'Max suggestions per block')}
                description={localize(language, '限制 AI 从单个块里抽取未来安排的数量。', 'Limit how many future plans AI can extract from a single block.')}
                control={
                  <SettingNumberField
                    label={localize(language, '每块最多建议条数', 'Max suggestions per block')}
                    value={calendarSettings.maxSuggestionsPerBlock}
                    min={MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
                    max={MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
                    onChange={(value) => {
                      onCalendarSettingsChange({
                        ...calendarSettings,
                        maxSuggestionsPerBlock: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}`, `Default ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}`)}
                  />
                }
              />
              <SettingsRow
                title={localize(language, '未来安排窗口', 'Upcoming window')}
                description={localize(language, '控制日历页“未来安排”列表的日期范围。', 'Control the date range shown in Calendar → Upcoming.')}
                control={
                  <SettingNumberField
                    label={localize(language, '未来安排窗口', 'Upcoming window')}
                    value={calendarSettings.upcomingDays}
                    min={MIN_CALENDAR_UPCOMING_DAYS}
                    max={MAX_CALENDAR_UPCOMING_DAYS}
                    onChange={(value) => {
                      onCalendarSettingsChange({
                        ...calendarSettings,
                        upcomingDays: value,
                      })
                    }}
                    description={localize(language, `默认 ${DEFAULT_CALENDAR_SETTINGS.upcomingDays} 天`, `Default ${DEFAULT_CALENDAR_SETTINGS.upcomingDays} days`)}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title={localize(language, '维护工具', 'Maintenance tools')}>
              <SettingsRow
                title={localize(language, '清理孤儿附件', 'Clean orphan attachments')}
                description={localize(language, '删除已经不再被任何块引用的附件文件和记录，适合导入覆盖或大量删除内容之后做一次整理。', 'Remove attachment files and records that are no longer referenced by any block. Useful after overwrite imports or large deletions.')}
                control={
                  <ActionButton
                    onClick={() => { void onCleanupOrphanAttachments?.() }}
                    disabled={!onCleanupOrphanAttachments}
                    testId="settings-cleanup-attachments"
                  >
                    {localize(language, '开始清理', 'Start cleanup')}
                  </ActionButton>
                }
              />
              <SettingsRow
                title={localize(language, '重试失败向量', 'Retry failed vectors')}
                description={localize(language, `${meta?.failedVectorCount ?? 0} 个失败向量可以重新入队，再由后台按当前模式继续处理。`, `${meta?.failedVectorCount ?? 0} failed vectors can be queued again and processed in the background using the current mode.`)}
                control={
                  <ActionButton
                    onClick={() => { void onRetryFailedVectors?.() }}
                    disabled={!onRetryFailedVectors || (meta?.failedVectorCount ?? 0) === 0}
                    testId="settings-retry-vectors"
                  >
                    {localize(language, '重试失败向量', 'Retry failed vectors')}
                  </ActionButton>
                }
              />
              <SettingsRow
                title={localize(language, '重建附件索引', 'Rebuild attachment index')}
                description={localize(language, '重新扫描块里的附件引用，补齐附件关系，并顺带清理扫描过程中发现的孤儿附件。', 'Rescan attachment references in blocks, repair attachment links, and clean any orphans found during the scan.')}
                control={
                  <ActionButton
                    onClick={() => { void onRebuildAttachmentIndex?.() }}
                    disabled={!onRebuildAttachmentIndex}
                    testId="settings-rebuild-attachments"
                  >
                    {localize(language, '重建附件索引', 'Rebuild attachment index')}
                  </ActionButton>
                }
              />
              <SettingsRow
                title={localize(language, '重建全部向量', 'Rebuild all vectors')}
                description={
                  rebuildAllVectorsDisabledReason(meta, language)
                    ? localize(language, `当前不可用：${rebuildAllVectorsDisabledReason(meta, language)}`, `Currently unavailable: ${rebuildAllVectorsDisabledReason(meta, language)}`)
                    : localize(language, '把全部块重新排队，按当前 embedding 配置完整重建向量索引。', 'Queue every block again and rebuild vector indexes using the current embedding configuration.')
                }
                control={
                  <ActionButton
                    onClick={() => { void onRebuildAllVectors?.() }}
                    disabled={!onRebuildAllVectors || Boolean(rebuildAllVectorsDisabledReason(meta, language))}
                    testId="settings-rebuild-vectors"
                  >
                    {localize(language, '重建全部向量', 'Rebuild all vectors')}
                  </ActionButton>
                }
              />
            </SettingsGroup>
          </div>
        )
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 border-t border-stone-200 bg-white text-stone-900" data-testid="settings-panel">
      <aside className="w-[250px] shrink-0 border-r border-stone-200 bg-white px-4 pb-6 pt-5" data-testid="settings-sidebar">
        <div className="space-y-6">
          {navGroups.map((group) => (
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
