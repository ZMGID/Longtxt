import { useEffect, useState, type ReactNode } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { ImportConflictStrategy, ImportPreview } from '../../shared/types'
import { useBlockCleanupDays } from '../hooks/useBlockCleanupDays'
import { formatNumberByLanguage, getCurrentLanguage } from '../i18n/locale'
import { useI18n } from '../i18n/useI18n'
import { removeBlocksCompat } from '../lib/blockCleanupCompat'
import { formatDateKeyLabel } from '../lib/format'
import { useDataManagementOverview, type DataManagementOverviewResult } from '../hooks/useDataManagementOverview'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { TimelineDayCleanupView } from './TimelineDayCleanupView'
import { useToast } from './toast-context'

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{eyebrow}</div>
      <h3 className="mt-2 text-[20px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">{description}</p>
    </div>
  )
}

function FlatButton({
  children,
  onClick,
  disabled = false,
  quiet = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  quiet?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        quiet
          ? 'border-stone-200 bg-transparent text-stone-600 hover:bg-white/70 hover:text-stone-900'
          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}

function MetricCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="bg-white px-3 py-2.5 sm:px-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">{label}</div>
      <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900 sm:text-[20px]">{value}</div>
      <div className="mt-0.5 text-[10px] leading-4 text-stone-500">{hint}</div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  monospace = false,
}: {
  label: string
  value: string
  monospace?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-stone-200 py-2 first:border-t-0">
      <div className="shrink-0 text-[12px] font-medium text-stone-500">{label}</div>
      <div className={`min-w-0 text-right text-[13px] leading-5 text-stone-900 ${monospace ? 'break-all font-mono text-[11px]' : ''}`}>{value}</div>
    </div>
  )
}

function CleanupDateRow({
  date,
  blockCount,
  active,
  onSelect,
}: {
  date: string
  blockCount: number
  active: boolean
  onSelect: () => void
}) {
  const language = getCurrentLanguage()
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-left transition first:border-t-0 sm:px-5 ${
        active ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-current">{formatDateKeyLabel(date, { weekday: true })}</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-stone-400">{date}</div>
      </div>
      <div className="shrink-0 text-sm font-semibold text-stone-500">{language === 'en' ? `${formatCount(blockCount)} blocks` : `${formatCount(blockCount)} 条`}</div>
    </button>
  )
}

function ImportPreviewPanel({
  importPreview,
  busy,
  onConfirm,
  onDismiss,
}: {
  importPreview: ImportPreview
  busy: boolean
  onConfirm: (strategy: ImportConflictStrategy) => void
  onDismiss: () => void
}) {
  const { language } = useI18n()
  const copy = language === 'en'
    ? {
        title: 'Import preview',
        files: 'files',
        blocks: 'blocks',
        conflicts: 'conflicts',
        noConflicts: 'no conflicts',
        settings: 'This backup also contains a settings snapshot and will restore {{count}} settings items during import.',
        skipAll: 'Skip all conflicts',
        overwriteAll: 'Overwrite all conflicts',
        cancel: 'Cancel',
      }
    : {
        title: '导入预览',
        files: '个文件',
        blocks: '个块',
        conflicts: '个冲突',
        noConflicts: '无冲突',
        settings: '这个备份还包含设置快照，导入时会额外恢复 {{count}} 项设置。',
        skipAll: '全部跳过冲突',
        overwriteAll: '全部覆盖冲突',
        cancel: '取消',
      }

  return (
    <div className="border-t border-amber-200 pt-4" data-testid="data-management-import-preview">
      <div className="text-sm font-semibold text-stone-900">{copy.title}</div>
      <p className="mt-1 text-sm leading-6 text-stone-500">
        {importPreview.format.toUpperCase()} · {formatCount(importPreview.totalFiles)} {copy.files} · {formatCount(importPreview.totalBlocks)} {copy.blocks}
        {importPreview.conflicts > 0 ? ` · ${formatCount(importPreview.conflicts)} ${copy.conflicts}` : ` · ${copy.noConflicts}`}
      </p>
      {importPreview.includesSettings ? (
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {copy.settings.replace('{{count}}', `${formatCount(importPreview.settingsEntryCount ?? 0)}`)}
        </p>
      ) : null}
      {importPreview.samples.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-stone-500">
          {importPreview.samples.map((sample) => (
            <div key={`${sample.filename}-${sample.preview}`}>{sample.filename}：{sample.preview}</div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <FlatButton disabled={busy} onClick={() => onConfirm('skip_all')}>
          {copy.skipAll}
        </FlatButton>
        <FlatButton disabled={busy} onClick={() => onConfirm('overwrite_all')}>
          {copy.overwriteAll}
        </FlatButton>
        <FlatButton quiet disabled={busy} onClick={onDismiss}>
          {copy.cancel}
        </FlatButton>
      </div>
    </div>
  )
}

function formatCount(value: number | null | undefined): string {
  if (value == null || value < 0) {
    return '—'
  }

  return formatNumberByLanguage(value, getCurrentLanguage())
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (getCurrentLanguage() === 'en' ? 'Operation failed. Please try again later.' : '操作失败，请稍后再试。')
}

function getCompatibilityMessage(overview: DataManagementOverviewResult | null): string | null {
  if (overview?.compatibilityMode === 'missing-handler') {
    return getCurrentLanguage() === 'en'
      ? 'Data management IPC is not registered in the current main process. Usually the app has not been fully restarted yet. Close and reopen the app to see the full overview.'
      : '当前窗口里的主进程还没有注册数据管理 IPC。通常是应用未完整重启：请关闭应用并重新打开，完整概览会出现。'
  }

  return null
}

export function DataManagementView() {
  const { language } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const overviewQuery = useDataManagementOverview()
  const cleanupDaysQuery = useBlockCleanupDays()
  const overview = overviewQuery.data ?? null
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [selectedCleanupDate, setSelectedCleanupDate] = useState<string | null>(null)
  const compatibilityMessage = getCompatibilityMessage(overview)
  const cleanupDays = cleanupDaysQuery.data ?? []
  const cleanupDayCount = cleanupDaysQuery.isPending && cleanupDays.length === 0 ? null : cleanupDays.length
  const copy = language === 'en'
    ? {
        loadingOverview: 'Loading data overview…',
        title: 'Data management',
        subtitle: 'Only keep metrics, cleanup, and backup entry points here. Runtime state now lives in Settings.',
        openDataDir: 'Open data directory',
        openSettingsDir: 'Open settings directory',
        refresh: 'Refresh',
        openedDataDir: 'Opened data directory.',
        openedSettingsDir: 'Opened settings directory.',
        overviewEyebrow: 'Overview',
        overviewTitle: 'Current volume',
        metricBlocks: 'Blocks',
        metricBlocksHint: 'Primary content blocks',
        metricNotebooks: 'Notebooks',
        metricNotebooksHint: 'Notebooks and structure containers',
        metricSnapshots: 'Snapshots',
        metricSnapshotsHint: 'Total document snapshots',
        metricAttachments: 'Attachments',
        metricAttachmentsHint: 'Registered attachment records',
        metricVectors: 'Vectors',
        metricVectorsHint: 'Indexed vectors written',
        metricDates: 'Dates',
        metricDatesHint: 'Dates that still have content',
        recoveryEyebrow: 'Recovery',
        recoveryTitle: 'Background processing safety',
        recoveryHint: 'Pause AI/vector work, clear stuck queues, and review whether startup already recovered oversized blocks.',
        recoveryPaused: 'Background AI/vector processing is paused. New blocks will be saved locally only.',
        recoveryActive: 'Background AI/vector processing is active.',
        recoveryStartupDone: 'Recovered {{count}} oversized pending block(s) during startup and skipped their AI/vector processing.',
        recoveryPendingBlocks: 'Pending blocks',
        recoverySkippedBlocks: 'Skipped blocks',
        recoveryOversizedBlocks: 'Oversized skips',
        pauseBackground: 'Pause background processing',
        resumeBackground: 'Resume background processing',
        pauseDone: 'Background processing paused.',
        resumeDone: 'Background processing resumed.',
        clearPendingVectors: 'Clear pending vectors',
        clearPendingVectorsDone: 'Cleared {{count}} pending vector job(s).',
        clearFailedVectors: 'Clear failed vectors',
        clearFailedVectorsDone: 'Cleared {{count}} failed vector record(s).',
        cleanupEyebrow: 'Cleanup',
        cleanupTitle: 'Browse by day and batch delete',
        cleanupHint: 'This now lives in Data instead of Timeline. Pick a date on the left and clean up that day on the right.',
        cleanupDatesTitle: 'Dates with content',
        cleanupDatesHint: 'Only dates that still have blocks are listed here. Select one to multi-select and delete on the right.',
        cleanupDatesLoading: 'Preparing cleanup dates…',
        cleanupDatesEmpty: 'No block content is available for cleanup right now.',
        cleanupSelectHint: 'After choosing a day on the left, all blocks for that day appear here with multi-select delete support.',
        backupEyebrow: 'Backup & paths',
        backupTitle: 'Export, import, and local locations',
        backupHint: 'Backup operations stay here. Maintenance tools moved to Advanced settings.',
        backupPanelTitle: 'Backup & restore',
        backupPanelHint: 'Markdown is good for manual reading. JSON is better for full migration and restore, including settings snapshots.',
        exportMarkdown: 'Export Markdown',
        exportJson: 'Export JSON',
        loadMarkdown: 'Load Markdown',
        loadJson: 'Load JSON',
        markdownCanceled: 'Markdown export canceled.',
        markdownDone: 'Markdown exported to {{path}}, {{count}} blocks.',
        jsonCanceled: 'JSON backup canceled.',
        jsonDone: 'Full JSON backup exported to {{path}}, {{count}} blocks with settings snapshot.',
        markdownImportCanceled: 'Markdown import canceled.',
        jsonImportCanceled: 'JSON import canceled.',
        importDone: 'Import completed: {{count}} blocks.',
        pathsTitle: 'Directories & paths',
        pathsHint: 'Open directories directly, or inspect current database and settings file locations.',
        dataDir: 'Data directory',
        dbFile: 'Database file',
        settingsDir: 'Settings directory',
        settingsFile: 'Settings file',
      }
    : {
        loadingOverview: '正在加载数据概览…',
        title: '数据管理',
        subtitle: '这里只保留数据量、内容清理和备份入口；运行状态统一放到设置页面里。',
        openDataDir: '打开数据目录',
        openSettingsDir: '打开设置目录',
        refresh: '刷新',
        openedDataDir: '已打开数据目录。',
        openedSettingsDir: '已打开设置目录。',
        overviewEyebrow: '总览',
        overviewTitle: '当前数据量',
        metricBlocks: '块',
        metricBlocksHint: '主内容块数量',
        metricNotebooks: '笔记本',
        metricNotebooksHint: '笔记本与结构容器',
        metricSnapshots: '快照',
        metricSnapshotsHint: '文档快照总数',
        metricAttachments: '附件',
        metricAttachmentsHint: '已登记附件记录',
        metricVectors: '向量',
        metricVectorsHint: '已写入向量索引',
        metricDates: '日期',
        metricDatesHint: '当前仍有内容的日期',
        recoveryEyebrow: '恢复与保护',
        recoveryTitle: '后台处理安全开关',
        recoveryHint: '这里可以暂停 AI / 向量后台处理、清空卡住队列，并查看启动时是否已自动恢复超长块。',
        recoveryPaused: '后台 AI / 向量处理已暂停。新块只会本地保存，不再继续补摘要、标签和向量。',
        recoveryActive: '后台 AI / 向量处理已开启。',
        recoveryStartupDone: '本次启动已自动恢复 {{count}} 个超长 pending 块，并跳过它们的 AI / 向量处理。',
        recoveryPendingBlocks: '待处理块',
        recoverySkippedBlocks: '已跳过块',
        recoveryOversizedBlocks: '超长跳过',
        pauseBackground: '暂停后台处理',
        resumeBackground: '恢复后台处理',
        pauseDone: '已暂停后台处理。',
        resumeDone: '已恢复后台处理。',
        clearPendingVectors: '清空待处理向量',
        clearPendingVectorsDone: '已清空 {{count}} 条待处理向量任务。',
        clearFailedVectors: '清空失败向量记录',
        clearFailedVectorsDone: '已清空 {{count}} 条失败向量记录。',
        cleanupEyebrow: '内容清理',
        cleanupTitle: '按天浏览并批量删除',
        cleanupHint: '这个功能放在数据管理里，不再放到时间轴。左侧选日期，右侧直接清理当天块内容，适合集中删除没用的话。',
        cleanupDatesTitle: '最近有内容的日期',
        cleanupDatesHint: '这里只列出当前仍有块的日期。选中后可在右侧多选并删除。',
        cleanupDatesLoading: '正在整理可清理的日期…',
        cleanupDatesEmpty: '当前没有可清理的块内容。',
        cleanupSelectHint: '选择左侧某一天后，这里会显示当天全部块，支持多选和批量删除。',
        backupEyebrow: '备份与目录',
        backupTitle: '导出、导入与本地位置',
        backupHint: '备份相关操作保留在这里；维护工具已移到设置里的高级设置。',
        backupPanelTitle: '备份与恢复',
        backupPanelHint: 'Markdown 适合人工查看，JSON 适合完整迁移与恢复；这里导出的 JSON 会连同设置快照一起保存。导入前会先给你预览，不直接落盘。',
        exportMarkdown: '导出 Markdown',
        exportJson: '导出 JSON',
        loadMarkdown: '加载 Markdown',
        loadJson: '加载 JSON',
        markdownCanceled: '已取消 Markdown 导出。',
        markdownDone: 'Markdown 已导出到 {{path}}，共 {{count}} 个块。',
        jsonCanceled: '已取消 JSON 备份。',
        jsonDone: '完整 JSON 备份已导出到 {{path}}，共 {{count}} 个块，并包含设置快照。',
        markdownImportCanceled: '已取消 Markdown 导入。',
        jsonImportCanceled: '已取消 JSON 导入。',
        importDone: '导入完成，共导入 {{count}} 个块。',
        pathsTitle: '目录与路径',
        pathsHint: '直接打开目录，或快速确认当前数据库与设置文件位置。',
        dataDir: '数据目录',
        dbFile: '数据库文件',
        settingsDir: '设置目录',
        settingsFile: '设置文件',
      }

  useEffect(() => {
    if (cleanupDays.length === 0) {
      setSelectedCleanupDate(null)
      return
    }

    if (!selectedCleanupDate || !cleanupDays.some((day) => day.date === selectedCleanupDate)) {
      setSelectedCleanupDate(cleanupDays[0].date)
    }
  }, [cleanupDays, selectedCleanupDate])

  async function refreshDataManagementState(): Promise<void> {
    const tasks: Array<Promise<unknown>> = [
      queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement(), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.meta(), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.blockCleanupDays(), exact: true }),
    ]

    if (selectedCleanupDate) {
      tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.blocksByDate(selectedCleanupDate), exact: true }))
    }

    await Promise.all(tasks)
  }

  async function handleManualRefresh(): Promise<void> {
    const tasks: Array<Promise<unknown>> = [
      overviewQuery.refetch(),
      cleanupDaysQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.meta(), exact: true }),
    ]

    if (selectedCleanupDate) {
      tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.blocksByDate(selectedCleanupDate), exact: true }))
    }

    await Promise.all(tasks)
  }

  async function runAction(action: string, task: () => Promise<void>): Promise<void> {
    if (busyAction) {
      return
    }

    setBusyAction(action)

    try {
      await task()
      await refreshDataManagementState()
    } catch (error) {
      toast('error', getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-stone-200 bg-white text-stone-900"
      data-testid="data-management-view"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {overviewQuery.isPending && !overview ? (
          <div className="border-t border-stone-200 px-5 py-8 text-sm text-stone-500 sm:px-6">{copy.loadingOverview}</div>
        ) : null}

        {overviewQuery.isError ? (
          <div className="border-t border-rose-200 bg-rose-50/70 px-5 py-4 text-sm text-rose-700 sm:px-6">
            {getErrorMessage(overviewQuery.error)}
          </div>
        ) : null}

        {overview ? (
          <>
            {compatibilityMessage ? (
              <div className="border-y border-amber-200 bg-amber-50/80 px-5 py-4 text-sm leading-6 text-amber-900 sm:px-6">
                {compatibilityMessage}
              </div>
            ) : null}

            <div className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{copy.title}</div>
                  <p className="mt-1 text-[13px] leading-5 text-stone-500">{copy.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FlatButton
                    disabled={busyAction !== null}
                    onClick={() => {
                      void runAction('open-data-directory', async () => {
                        await changbu.settings.openDataDirectory()
                        toast('success', copy.openedDataDir)
                      })
                    }}
                  >
                    {copy.openDataDir}
                  </FlatButton>
                  <FlatButton
                    disabled={busyAction !== null}
                    onClick={() => {
                      void runAction('open-settings-directory', async () => {
                        await changbu.settings.openSettingsDirectory()
                        toast('success', copy.openedSettingsDir)
                      })
                    }}
                  >
                    {copy.openSettingsDir}
                  </FlatButton>
                  <FlatButton
                    quiet
                    disabled={busyAction !== null}
                    onClick={() => {
                      void handleManualRefresh()
                    }}
                  >
                    {copy.refresh}
                  </FlatButton>
                </div>
              </div>

              <div className="mt-3 overflow-hidden border border-stone-200">
                <div className="border-b border-stone-200 px-3 py-2.5 sm:px-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{copy.overviewEyebrow}</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-stone-900">{copy.overviewTitle}</div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-stone-200 md:grid-cols-3 xl:grid-cols-6" data-testid="data-management-metrics">
                  <MetricCell label={copy.metricBlocks} value={formatCount(overview.totalBlockCount)} hint={copy.metricBlocksHint} />
                  <MetricCell label={copy.metricNotebooks} value={formatCount(overview.totalNotebookCount)} hint={copy.metricNotebooksHint} />
                  <MetricCell label={copy.metricSnapshots} value={formatCount(overview.totalSnapshotCount)} hint={copy.metricSnapshotsHint} />
                  <MetricCell label={copy.metricAttachments} value={formatCount(overview.totalAttachmentCount)} hint={copy.metricAttachmentsHint} />
                  <MetricCell label={copy.metricVectors} value={formatCount(overview.totalVectorCount)} hint={copy.metricVectorsHint} />
                  <MetricCell label={copy.metricDates} value={formatCount(cleanupDayCount)} hint={copy.metricDatesHint} />
                </div>
              </div>

              <div className="mt-3 border border-stone-200 bg-stone-50/60 px-4 py-4 sm:px-5" data-testid="data-management-recovery">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{copy.recoveryEyebrow}</div>
                    <div className="mt-0.5 text-[13px] font-semibold text-stone-900">{copy.recoveryTitle}</div>
                    <p className="mt-1 text-sm leading-6 text-stone-500">{copy.recoveryHint}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('toggle-background-processing', async () => {
                          const result = await changbu.data.setBackgroundProcessingPaused(!overview.backgroundProcessingPaused)
                          toast('success', result.paused ? copy.pauseDone : copy.resumeDone)
                        })
                      }}
                    >
                      {overview.backgroundProcessingPaused ? copy.resumeBackground : copy.pauseBackground}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('clear-pending-vectors', async () => {
                          const count = await changbu.data.clearPendingVectors()
                          toast('success', copy.clearPendingVectorsDone.replace('{{count}}', formatCount(count)))
                        })
                      }}
                    >
                      {copy.clearPendingVectors}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('clear-failed-vectors', async () => {
                          const count = await changbu.data.clearFailedVectors()
                          toast('success', copy.clearFailedVectorsDone.replace('{{count}}', formatCount(count)))
                        })
                      }}
                    >
                      {copy.clearFailedVectors}
                    </FlatButton>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-stone-600 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-md border border-stone-200 bg-white px-3 py-3 leading-6 text-stone-600">
                    {overview.backgroundProcessingPaused ? copy.recoveryPaused : copy.recoveryActive}
                    {(overview.startupRecoveredBlockCount ?? 0) > 0 ? (
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        {copy.recoveryStartupDone.replace('{{count}}', formatCount(overview.startupRecoveredBlockCount))}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-px overflow-hidden border border-stone-200 bg-stone-200">
                    <MetricCell label={copy.recoveryPendingBlocks} value={formatCount(overview.pendingBlockCount)} hint={copy.metricBlocksHint} />
                    <MetricCell label={copy.recoverySkippedBlocks} value={formatCount(overview.skippedBlockCount)} hint={copy.recoveryHint} />
                    <MetricCell label={copy.recoveryOversizedBlocks} value={formatCount(overview.oversizedSkippedBlockCount)} hint={copy.metricVectorsHint} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 px-5 py-5 sm:px-6">
              <SectionHeader
                eyebrow={copy.cleanupEyebrow}
                title={copy.cleanupTitle}
                description={copy.cleanupHint}
              />

              <div className="mt-4 grid h-[min(62vh,680px)] min-h-[460px] border-y border-stone-200 xl:grid-cols-[280px_minmax(0,1fr)] xl:divide-x xl:divide-stone-200">
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <div className="border-b border-stone-200 px-4 py-4 sm:px-5">
                    <div className="text-sm font-semibold text-stone-900">{copy.cleanupDatesTitle}</div>
                    <p className="mt-1 text-sm leading-6 text-stone-500">{copy.cleanupDatesHint}</p>
                  </div>

                  {cleanupDaysQuery.isPending && cleanupDays.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-stone-500 sm:px-5">{copy.cleanupDatesLoading}</div>
                  ) : null}

                  {cleanupDaysQuery.isError ? (
                    <div className="border-t border-rose-200 bg-rose-50/70 px-4 py-4 text-sm text-rose-700 sm:px-5">
                      {getErrorMessage(cleanupDaysQuery.error)}
                    </div>
                  ) : null}

                  {!cleanupDaysQuery.isPending && !cleanupDaysQuery.isError && cleanupDays.length === 0 ? (
                    <div className="px-4 py-6 text-sm leading-6 text-stone-500 sm:px-5">{copy.cleanupDatesEmpty}</div>
                  ) : null}

                  {!cleanupDaysQuery.isPending && !cleanupDaysQuery.isError && cleanupDays.length > 0 ? (
                    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="data-management-cleanup-days">
                      {cleanupDays.map((day) => (
                        <CleanupDateRow
                          key={day.date}
                          date={day.date}
                          blockCount={day.blockCount}
                          active={day.date === selectedCleanupDate}
                          onSelect={() => {
                            setSelectedCleanupDate(day.date)
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex min-h-0 min-w-0 flex-col border-t border-stone-200 xl:border-t-0">
                  {selectedCleanupDate ? (
                    <TimelineDayCleanupView
                      date={selectedCleanupDate}
                      embedded
                      onDeleteBlocks={async (ids) => {
                        const result = await removeBlocksCompat(ids)
                        await Promise.all([
                          cleanupDaysQuery.refetch(),
                          refreshDataManagementState(),
                        ])
                        return result
                      }}
                    />
                  ) : (
                    <div className="px-5 py-8 text-sm leading-6 text-stone-500 sm:px-6">
                      {copy.cleanupSelectHint}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 px-5 py-5 sm:px-6">
              <SectionHeader
                eyebrow={copy.backupEyebrow}
                title={copy.backupTitle}
                description={copy.backupHint}
              />

              <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900">{copy.backupPanelTitle}</div>
                  <p className="mt-1 text-sm leading-6 text-stone-500">{copy.backupPanelHint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('export-markdown', async () => {
                          const result = await changbu.exports.markdown({ includeAttachments: true })

                          if (!result) {
                            toast('info', copy.markdownCanceled)
                            return
                          }

                          toast('success', copy.markdownDone.replace('{{path}}', result.path).replace('{{count}}', formatCount(result.count)))
                        })
                      }}
                    >
                      {copy.exportMarkdown}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('export-json', async () => {
                          const result = await changbu.exports.json({ includeAttachments: true, includeSettings: true })

                          if (!result) {
                            toast('info', copy.jsonCanceled)
                            return
                          }

                          toast('success', copy.jsonDone.replace('{{path}}', result.path).replace('{{count}}', formatCount(result.count)))
                        })
                      }}
                    >
                      {copy.exportJson}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('preview-import-markdown', async () => {
                          const preview = await changbu.imports.previewMarkdown()

                          if (!preview) {
                            setImportPreview(null)
                            toast('info', copy.markdownImportCanceled)
                            return
                          }

                          setImportPreview(preview)
                        })
                      }}
                    >
                      {copy.loadMarkdown}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('preview-import-json', async () => {
                          const preview = await changbu.imports.previewJson()

                          if (!preview) {
                            setImportPreview(null)
                            toast('info', copy.jsonImportCanceled)
                            return
                          }

                          setImportPreview(preview)
                        })
                      }}
                    >
                      {copy.loadJson}
                    </FlatButton>
                  </div>

                  {importPreview ? (
                    <div className="mt-4">
                      <ImportPreviewPanel
                        importPreview={importPreview}
                        busy={busyAction !== null}
                        onConfirm={(strategy) => {
                          void runAction('confirm-import', async () => {
                            const result = await changbu.imports.confirm(importPreview.importId, strategy)
                            setImportPreview(null)
                            toast('success', copy.importDone.replace('{{count}}', formatCount(result.imported)))
                          })
                        }}
                        onDismiss={() => {
                          setImportPreview(null)
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 border-t border-stone-200 pt-5 xl:border-l xl:border-stone-200 xl:pl-8 xl:pt-0">
                  <div className="text-sm font-semibold text-stone-900">{copy.pathsTitle}</div>
                  <p className="mt-1 text-sm leading-6 text-stone-500">{copy.pathsHint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('open-data-directory', async () => {
                          await changbu.settings.openDataDirectory()
                          toast('success', copy.openedDataDir)
                        })
                      }}
                    >
                      {copy.openDataDir}
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('open-settings-directory', async () => {
                          await changbu.settings.openSettingsDirectory()
                          toast('success', copy.openedSettingsDir)
                        })
                      }}
                    >
                      {copy.openSettingsDir}
                    </FlatButton>
                  </div>
                  <div className="mt-4 border-t border-stone-200 pt-2">
                    <InfoRow label={copy.dataDir} value={overview.dataDirectory} monospace />
                    <InfoRow label={copy.dbFile} value={overview.databasePathPending ? (language === 'en' ? 'Available after app restart' : '需要重启应用后读取') : overview.databasePath} monospace />
                    <InfoRow label={copy.settingsDir} value={overview.settingsDirectoryPending ? (language === 'en' ? 'Available after app restart' : '需要重启应用后读取') : overview.settingsDirectory} monospace />
                    <InfoRow label={copy.settingsFile} value={overview.settingsFilePathPending ? (language === 'en' ? 'Available after app restart' : '需要重启应用后读取') : overview.settingsFilePath} monospace />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
