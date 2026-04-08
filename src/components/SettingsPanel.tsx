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

const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
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

function formatCompactStat(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatExternalAccessTime(value: string | null): string {
  if (!value) {
    return '尚未生成'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
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
}: {
  title: string
  hint: string
  usage: TokenUsage | null | undefined
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
        <div className="text-[11px] font-medium text-stone-400">{hasUsage ? `${formatCompactStat(normalizedUsage.requestCount)} 次请求` : '暂无调用'}</div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-stone-200">
        <div className="bg-[#faf8f4] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">请求</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.requestCount)}</div>
        </div>
        <div className="bg-[#faf8f4] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Prompt</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.promptTokens)}</div>
        </div>
        <div className="bg-[#faf8f4] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Completion</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.completionTokens)}</div>
        </div>
        <div className="bg-[#faf8f4] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Total</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.totalTokens)}</div>
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

function runtimeAiStatus(meta: AppMeta | null): string {
  if (!meta?.aiConfigured) {
    return '未配置，当前使用 mock'
  }

  if (meta.activeAiMode === 'live') {
    return meta.lastAiError ? 'live AI 已启用，但最近运行失败' : 'live AI 已启用'
  }

  return '配置已保存，但当前仍停留在 mock'
}

function runtimeVectorStatus(meta: AppMeta | null): string {
  if (!meta?.vectorReady) {
    return '已降级：搜索仍可用，但仅标签 + FTS，不走向量召回'
  }

  if (!meta.vectorSchemaReady) {
    return '向量可用，但 Schema 仍在准备'
  }

  return `可用 · ${meta.vectorDimension ?? '?'} 维`
}

function runtimeQueueStatus(meta: AppMeta | null): string {
  if (!meta) {
    return '加载中…'
  }

  if (meta.failedVectorCount > 0) {
    return `失败待重试 · ${meta.failedVectorCount} 个块`
  }

  if (meta.pendingVectorCount > 0) {
    return meta.vectorQueueProcessing ? `处理中 · ${meta.pendingVectorCount} 个待补齐` : `积压中 · ${meta.pendingVectorCount} 个待补齐`
  }

  return '正常'
}

function rebuildAllVectorsDisabledReason(meta: AppMeta | null): string | null {
  if (!meta) {
    return '正在加载当前状态。'
  }

  if (!meta.vectorReady) {
    return '当前数据库未启用向量索引。'
  }

  if (meta.aiConfigured && meta.activeAiMode !== 'live') {
    return '已配置 AI 但尚未完成测试，请先完成连接测试。'
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
  const { toast } = useToast()
  const advancedOverrideCount = countAdvancedOverrides(docGenerationSettings, blockEnrichSettings, calendarSettings)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(importPreview ? 'backup' : 'about')
  const [fileActionPending, setFileActionPending] = useState<'data-directory' | 'settings-directory' | null>(null)

  const pageTitle = useMemo(() => {
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
  }, [activeSection])

  const headerActions = useMemo(() => {
    switch (activeSection) {
      case 'general':
      case 'advanced':
        return (
          <ActionButton primary disabled={saving} onClick={() => { void onSave() }}>
            {saving ? '保存中…' : '保存设置'}
          </ActionButton>
        )
      case 'ai':
        return (
          <>
            <ActionButton primary disabled={saving} onClick={() => { void onSave() }}>
              {saving ? '保存中…' : '保存设置'}
            </ActionButton>
            <ActionButton disabled={testing} onClick={() => { void onTest() }}>
              {testing ? '检测中…' : '测试连接'}
            </ActionButton>
          </>
        )
      default:
        return null
    }
  }, [activeSection, onSave, onTest, saving, testing])

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
      toast('error', '当前环境不支持剪贴板复制。')
      return
    }

    try {
      await navigator.clipboard.writeText(externalAccessStatus.searchCommandExample)
      toast('success', '已复制示例查询命令。')
    } catch {
      toast('error', '复制命令失败。')
    }
  }

  function renderSectionContent() {
    switch (activeSection) {
      case 'about':
        return (
          <div className="space-y-10">
            <SettingsGroup title="运行与索引">
              <SettingsRow
                title="应用状态"
                description="这里集中显示当前 AI / 向量状态、最近测试结果和后台运行情况，不再在数据管理里重复出现。"
                control={
                  <div className="text-right text-sm text-stone-500">
                    <div className="font-semibold text-stone-900">长布桌面版</div>
                    <div>数据目录已连接</div>
                  </div>
                }
              />
              <SettingsRow title="AI 模式" description={runtimeAiStatus(meta)} />
              <SettingsRow title="向量状态" description={runtimeVectorStatus(meta)} />
              <SettingsRow title="队列状态" description={runtimeQueueStatus(meta)} />
              <SettingsRow title="Base URL" description={meta?.resolvedBaseUrl ?? '尚未解析'} />
              <SettingsRow
                title="最近测试"
                description={
                  meta?.lastAiTestResult
                    ? `${meta.lastAiTestResult.success ? '测试通过' : '测试失败'} · ${new Date(meta.lastAiTestResult.checkedAt).toLocaleString('zh-CN')}`
                    : '还没有 API 测试记录。'
                }
              />
              <SettingsRow title="待处理向量" description={`${meta?.pendingVectorCount ?? 0} 个`} />
              <SettingsRow title="失败向量" description={`${meta?.failedVectorCount ?? 0} 个`} />
              {meta?.lastAiError ? <SettingsRow title="最近运行错误" description={meta.lastAiError} /> : null}
            </SettingsGroup>

            <SettingsGroup title="Token 使用">
              <div className="grid gap-3 lg:grid-cols-2">
                <TokenUsagePanel title="当前会话" hint="本次启动后的调用统计。" usage={meta?.tokenUsage} />
                <TokenUsagePanel title="累计总计" hint="跨重启累计保存的总用量。" usage={meta?.lifetimeTokenUsage} />
              </div>
            </SettingsGroup>
          </div>
        )
      case 'general':
        return (
          <SettingsGroup title="功能开关">
            <SettingsRow
              title="启用 AI 日期建议"
              description="块 enrich 完成后，若内容里有明确未来日期安排，会在日历里生成 AI 建议；开启自动加入后会直接成为正式安排。"
              control={
                <SettingSwitch
                  label="启用 AI 日期建议"
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
              title="AI 建议自动加入日历"
              description={calendarSettings.aiSuggestionsEnabled
                ? '识别到明确的未来安排后，直接创建正式日历事项，不再等待手动确认。'
                : '先启用 AI 日期建议后，才可以打开自动加入。'}
              control={
                <SettingSwitch
                  label="AI 建议自动加入日历"
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
              title="显示左侧时间线"
              description="在时间轴页左侧显示极简日期时间线，并随滚动高亮当前所在日期。"
              control={
                <SettingSwitch
                  label="显示左侧时间线"
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
          </SettingsGroup>
        )
      case 'ai':
        return (
          <div className="space-y-10">
            <SettingsGroup title="LLM">
              <SettingsRow
                title="Endpoint"
                description="用于摘要、文档生成与 AI 写作流程。"
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
                description="保存后会写入本地设置文件。"
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
                description="例如 gpt-4o-mini。"
                control={
                  <SettingField
                    label="Model"
                    value={config.llm.model}
                    placeholder="gpt-4o-mini"
                    onChange={(value) => onChange({ ...config, llm: { ...config.llm, model: value } })}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title="Embedding">
              <SettingsRow
                title="Endpoint"
                description="用于向量检索、连接图和语义召回。"
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
                description="如需单独的 embedding 提供方，可与 LLM 使用不同密钥。"
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
                description="例如 text-embedding-3-small。"
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
            <SettingsGroup title="快速操作">
              <SettingsRow
                title="接入开关"
                description={
                  externalAccessStatus
                    ? externalAccessStatus.enabled
                      ? '当前已启用。CLI 在执行真实读写前会检查这个状态。'
                      : '当前未启用。先启用，外部工具才可以真正读写长布内容。'
                    : '正在读取外部接入状态。'
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
                      {externalAccessBusyAction === 'enable' ? '启用中…' : '启用接入'}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy || !externalAccessStatus?.enabled}
                      onClick={() => {
                        void onDisableExternalAccess()
                      }}
                      testId="settings-disable-external-access"
                    >
                      {externalAccessBusyAction === 'disable' ? '停用中…' : '停用接入'}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy}
                      onClick={() => {
                        void onRefreshExternalAccess()
                      }}
                      testId="settings-refresh-external-access"
                    >
                      {externalAccessBusyAction === 'refresh' ? '刷新中…' : '刷新状态'}
                    </ActionButton>
                  </>
                }
              />
              <SettingsRow
                title="生成接入包"
                description="生成物统一放在长布自己的接入目录里。你要给 Claude、Codex 或别的工具用，都从这里拿。"
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
                      {externalAccessBusyAction === 'generate' ? '生成中…' : externalAccessStatus?.generatedAt ? '重新生成接入包' : '生成接入包'}
                    </ActionButton>
                    <ActionButton
                      disabled={externalAccessBusy || !externalAccessStatus}
                      onClick={() => {
                        void onOpenExternalAccessDirectory()
                      }}
                      testId="settings-open-external-access-directory"
                    >
                      {externalAccessBusyAction === 'open' ? '打开中…' : '打开接入目录'}
                    </ActionButton>
                    <ActionButton
                      disabled={!externalAccessStatus}
                      onClick={() => {
                        void copyExternalAccessCommand()
                      }}
                      testId="settings-copy-external-access-command"
                    >
                      复制示例查询命令
                    </ActionButton>
                  </>
                }
              />
              <SettingsRow
                title="当前结果"
                description={
                  externalAccessStatus
                    ? [
                        `接入：${externalAccessStatus.enabled ? '已启用' : '未启用'}`,
                        `CLI：${externalAccessStatus.cliExists ? '已生成' : '未生成'}`,
                        `总说明：${externalAccessStatus.integrationReadmeExists ? '已生成' : '未生成'}`,
                        `通用规则：${externalAccessStatus.agentGuideExists ? '已生成' : '未生成'}`,
                        `适配器：${externalAccessStatus.skillExists ? '已生成' : '未生成'}`,
                      ].join(' · ')
                    : '正在读取状态。'
                }
              />
            </SettingsGroup>

            <SettingsGroup title="生成产物">
              <SettingsRow
                title="接入包目录"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliDirectory) : '生成后会显示接入包根目录。'}
              />
              <SettingsRow
                title="CLI 路径"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliPath) : '生成后会显示本地 CLI 包装脚本路径。'}
              />
              <SettingsRow
                title="README"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.integrationReadmePath) : '生成后会显示通用接入说明 README。'}
              />
              <SettingsRow
                title="AGENTS"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.agentGuidePath) : '生成后会显示可复用的 AGENTS.md 提示文件。'}
              />
              <SettingsRow
                title="命令说明"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.commandsGuidePath) : '生成后会显示 CLI 命令说明。'}
              />
              <SettingsRow
                title="工作流说明"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.workflowsGuidePath) : '生成后会显示检索与写入工作流说明。'}
              />
              <SettingsRow
                title="示例目录"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.examplesDirectory) : '生成后会显示 examples 目录。'}
              />
              <SettingsRow
                title="适配器目录"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.adaptersDirectory) : '生成后会显示 adapters 目录。'}
              />
              <SettingsRow
                title="Claude 模板目录"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.skillDirectory) : '生成后会显示 Claude 模板目录。'}
              />
              <SettingsRow
                title="可执行文件"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.executablePath) : '加载中…'}
              />
              <SettingsRow
                title="最近生成时间"
                description={formatExternalAccessTime(externalAccessStatus?.generatedAt ?? null)}
              />
              <SettingsRow
                title="自检命令"
                description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.doctorCommand) : '生成后会显示 doctor 命令。'}
              />
            </SettingsGroup>

            <SettingsGroup title="问题与说明">
              <SettingsRow
                title="当前问题"
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
                      : '没有检测到问题。'
                    : '正在读取状态。'
                }
              />
              <SettingsRow
                title="说明"
                description="这里默认生成的是完整通用接入包：包含 guides、examples 和 adapters。Claude 只是 adapters 里的一个模板，不再自动塞进它自己的目录。外部 CLI 目前支持 search、tag、get、list、create、update、remove、tags、doctor。"
              />
            </SettingsGroup>
          </div>
        )
      case 'backup':
        return (
          <div className="space-y-10">
            <SettingsGroup title="备份">
              <SettingsRow
                title="创建备份"
                description="导出当前块数据、附件和设置快照，适合完整迁移、归档和手动留档。"
                control={
                  <ActionButton primary onClick={() => { void onCreateBackup() }} testId="settings-create-backup">
                    创建备份
                  </ActionButton>
                }
              />
              <SettingsRow
                title="加载备份"
                description="读取 JSON 备份并先展示预览，再决定如何处理冲突。"
                control={
                  <ActionButton onClick={() => { void onLoadBackupPreview() }} testId="settings-load-backup">
                    加载备份
                  </ActionButton>
                }
              />
            </SettingsGroup>

            {importPreview ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4" data-testid="settings-import-preview">
                <div className="text-sm font-semibold text-amber-900">备份预览</div>
                <div className="mt-1 text-xs leading-5 text-amber-800">
                  {importPreview.format.toUpperCase()} · {importPreview.totalFiles} 个文件 / {importPreview.totalBlocks} 个块 · 冲突 {importPreview.conflicts}
                </div>
                {importPreview.includesSettings ? (
                  <div className="mt-1 text-xs leading-5 text-amber-800">
                    含设置快照 · {importPreview.settingsEntryCount ?? 0} 项设置会在导入时一并恢复
                  </div>
                ) : null}
                <div className="mt-3 space-y-1 text-xs text-amber-800">
                  {importPreview.samples.map((sample) => (
                    <p key={`${sample.filename}-${sample.preview}`}>{sample.filename}：{sample.preview}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {importPreview.conflicts > 0 ? (
                    <>
                      <ActionButton onClick={() => { void onConfirmImport('skip_all') }}>
                        全部跳过冲突
                      </ActionButton>
                      <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                        全部覆盖冲突
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                      确认导入
                    </ActionButton>
                  )}
                  <ActionButton onClick={onDismissImportPreview}>取消</ActionButton>
                </div>
              </section>
            ) : null}
          </div>
        )
      case 'files':
        return (
          <SettingsGroup title="本地文件">
            <SettingsRow
              title="打开数据目录"
              description="查看数据库、附件等运行数据。"
              control={
                <ActionButton
                  onClick={() => {
                    void runFileAction('data-directory', onOpenDataDirectory, '打开数据目录失败。')
                  }}
                  disabled={fileActionPending !== null}
                >
                  打开数据目录
                </ActionButton>
              }
            />
            <SettingsRow
              title="打开设置文件目录"
              description="查看 changbu-settings.json 等持久化配置文件。"
              control={
                <ActionButton
                  onClick={() => {
                    void runFileAction('settings-directory', onOpenSettingsDirectory, '打开设置文件目录失败。')
                  }}
                  disabled={fileActionPending !== null}
                >
                  打开设置文件目录
                </ActionButton>
              }
            />
          </SettingsGroup>
        )
      case 'advanced':
        return (
          <div className="space-y-10" data-testid="settings-advanced-panel">
            <SettingsGroup title="文档生成">
              <SettingsRow
                title="最大引用块数"
                description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}，保存时会自动限制在 ${MIN_DOC_GENERATION_REFERENCE_BLOCKS} 到 ${MAX_DOC_GENERATION_REFERENCE_BLOCKS} 之间。`}
                control={
                  <SettingNumberField
                    label="最大引用块数"
                    value={docGenerationSettings.maxReferenceBlocks}
                    min={MIN_DOC_GENERATION_REFERENCE_BLOCKS}
                    max={MAX_DOC_GENERATION_REFERENCE_BLOCKS}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        maxReferenceBlocks: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}`}
                  />
                }
              />
              <SettingsRow
                title="召回候选块数"
                description="生成前先从搜索结果里取这么多候选块，再筛选引用。"
                control={
                  <SettingNumberField
                    label="召回候选块数"
                    value={docGenerationSettings.retrievalLimit}
                    min={MIN_DOC_GENERATION_RETRIEVAL_LIMIT}
                    max={MAX_DOC_GENERATION_RETRIEVAL_LIMIT}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        retrievalLimit: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}`}
                  />
                }
              />
              <SettingsRow
                title="生成温度"
                description="越低越稳，越高越发散。建议 0 到 0.4。"
                control={
                  <SettingNumberField
                    label="生成温度"
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
                    description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}`}
                  />
                }
              />
              <SettingsRow
                title="模型流式输出"
                description="开启后，每日回顾和 AI 洞察会边生成边显示；关闭后等待完整结果再展示。"
                control={
                  <SettingSwitch
                    label="模型流式输出"
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
                title="输出 Token 上限"
                description="限制单次文档生成的输出长度与成本。"
                control={
                  <SettingNumberField
                    label="输出 Token 上限"
                    value={docGenerationSettings.maxOutputTokens}
                    min={MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS}
                    max={MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS}
                    onChange={(value) => {
                      onDocGenerationSettingsChange({
                        ...docGenerationSettings,
                        maxOutputTokens: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}`}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title="块 enrich">
              <SettingsRow
                title="启用 live enrich 队列"
                description="仅对已启用的 live AI 生效。创建多个块时会先短暂聚合，再合并请求，以减少调用次数和费用。"
                control={
                  <SettingSwitch
                    label="启用 live enrich 队列"
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
                title="单次最多合并块数"
                description={`保存时会自动限制在 ${MIN_BLOCK_ENRICH_BATCH_BLOCKS} 到 ${MAX_BLOCK_ENRICH_BATCH_BLOCKS} 之间。`}
                control={
                  <SettingNumberField
                    label="单次最多合并块数"
                    value={blockEnrichSettings.maxBatchBlocks}
                    min={MIN_BLOCK_ENRICH_BATCH_BLOCKS}
                    max={MAX_BLOCK_ENRICH_BATCH_BLOCKS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        maxBatchBlocks: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}`}
                  />
                }
              />
              <SettingsRow
                title="聚合等待时间"
                description="达到块数上限前，会最多等待这段时间再一起发送。"
                control={
                  <SettingNumberField
                    label="聚合等待时间"
                    value={blockEnrichSettings.queueDebounceMs}
                    min={MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
                    max={MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        queueDebounceMs: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs} ms`}
                  />
                }
              />
              <SettingsRow
                title="预留输出 Token"
                description="批量请求会先按模型上下文估算，再预留这部分空间给返回结果。"
                control={
                  <SettingNumberField
                    label="预留输出 Token"
                    value={blockEnrichSettings.responseReserveTokens}
                    min={MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
                    max={MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
                    onChange={(value) => {
                      onBlockEnrichSettingsChange({
                        ...blockEnrichSettings,
                        responseReserveTokens: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}`}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title="日历窗口">
              <SettingsRow
                title="每块最多建议条数"
                description="限制 AI 从单个块里抽取未来安排的数量。"
                control={
                  <SettingNumberField
                    label="每块最多建议条数"
                    value={calendarSettings.maxSuggestionsPerBlock}
                    min={MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
                    max={MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
                    onChange={(value) => {
                      onCalendarSettingsChange({
                        ...calendarSettings,
                        maxSuggestionsPerBlock: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}`}
                  />
                }
              />
              <SettingsRow
                title="未来安排窗口"
                description="控制日历页“未来安排”列表的日期范围。"
                control={
                  <SettingNumberField
                    label="未来安排窗口"
                    value={calendarSettings.upcomingDays}
                    min={MIN_CALENDAR_UPCOMING_DAYS}
                    max={MAX_CALENDAR_UPCOMING_DAYS}
                    onChange={(value) => {
                      onCalendarSettingsChange({
                        ...calendarSettings,
                        upcomingDays: value,
                      })
                    }}
                    description={`默认 ${DEFAULT_CALENDAR_SETTINGS.upcomingDays} 天`}
                  />
                }
              />
            </SettingsGroup>

            <SettingsGroup title="维护工具">
              <SettingsRow
                title="清理孤儿附件"
                description="删除已经不再被任何块引用的附件文件和记录，适合导入覆盖或大量删除内容之后做一次整理。"
                control={
                  <ActionButton
                    onClick={() => { void onCleanupOrphanAttachments?.() }}
                    disabled={!onCleanupOrphanAttachments}
                    testId="settings-cleanup-attachments"
                  >
                    开始清理
                  </ActionButton>
                }
              />
              <SettingsRow
                title="重试失败向量"
                description={`${meta?.failedVectorCount ?? 0} 个失败向量可以重新入队，再由后台按当前模式继续处理。`}
                control={
                  <ActionButton
                    onClick={() => { void onRetryFailedVectors?.() }}
                    disabled={!onRetryFailedVectors || (meta?.failedVectorCount ?? 0) === 0}
                    testId="settings-retry-vectors"
                  >
                    重试失败向量
                  </ActionButton>
                }
              />
              <SettingsRow
                title="重建附件索引"
                description="重新扫描块里的附件引用，补齐附件关系，并顺带清理扫描过程中发现的孤儿附件。"
                control={
                  <ActionButton
                    onClick={() => { void onRebuildAttachmentIndex?.() }}
                    disabled={!onRebuildAttachmentIndex}
                    testId="settings-rebuild-attachments"
                  >
                    重建附件索引
                  </ActionButton>
                }
              />
              <SettingsRow
                title="重建全部向量"
                description={
                  rebuildAllVectorsDisabledReason(meta)
                    ? `当前不可用：${rebuildAllVectorsDisabledReason(meta)}`
                    : '把全部块重新排队，按当前 embedding 配置完整重建向量索引。'
                }
                control={
                  <ActionButton
                    onClick={() => { void onRebuildAllVectors?.() }}
                    disabled={!onRebuildAllVectors || Boolean(rebuildAllVectorsDisabledReason(meta))}
                    testId="settings-rebuild-vectors"
                  >
                    重建全部向量
                  </ActionButton>
                }
              />
            </SettingsGroup>
          </div>
        )
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 border-t border-stone-200 bg-[#f7f5f2] text-stone-900">
      <aside className="w-[250px] shrink-0 border-r border-stone-200 bg-[#f6f4f1] px-4 pb-6 pt-5">
        <div className="space-y-6">
          {SETTINGS_NAV_GROUPS.map((group) => (
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
                ? `连接成功：Models ${testResult.modelsOk ? 'OK' : '失败'} / Embedding ${testResult.embeddingOk ? 'OK' : '失败'} / LLM ${testResult.llmOk ? 'OK' : '失败'} / Stream ${testResult.llmStreamingOk ? 'OK' : '失败'}`
                : testResult.error}
            </div>
          ) : null}

          {renderSectionContent()}
        </div>
      </div>
    </section>
  )
}
