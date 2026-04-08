import { useEffect, useState, type ReactNode } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { ImportConflictStrategy, ImportPreview } from '../../shared/types'
import { useBlockCleanupDays } from '../hooks/useBlockCleanupDays'
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
    <div className="bg-[#faf8f4] px-3 py-2.5 sm:px-4">
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
      <div className="shrink-0 text-sm font-semibold text-stone-500">{blockCount} 条</div>
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
  return (
    <div className="border-t border-amber-200 pt-4" data-testid="data-management-import-preview">
      <div className="text-sm font-semibold text-stone-900">导入预览</div>
      <p className="mt-1 text-sm leading-6 text-stone-500">
        {importPreview.format.toUpperCase()} · {importPreview.totalFiles} 个文件 · {importPreview.totalBlocks} 个块
        {importPreview.conflicts > 0 ? ` · ${importPreview.conflicts} 个冲突` : ' · 无冲突'}
      </p>
      {importPreview.includesSettings ? (
        <p className="mt-1 text-xs leading-5 text-stone-500">
          这个备份还包含设置快照，导入时会额外恢复 {importPreview.settingsEntryCount ?? 0} 项设置。
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
          全部跳过冲突
        </FlatButton>
        <FlatButton disabled={busy} onClick={() => onConfirm('overwrite_all')}>
          全部覆盖冲突
        </FlatButton>
        <FlatButton quiet disabled={busy} onClick={onDismiss}>
          取消
        </FlatButton>
      </div>
    </div>
  )
}

function formatCount(value: number | null | undefined): string {
  if (value == null || value < 0) {
    return '—'
  }

  return new Intl.NumberFormat('zh-CN').format(value)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后再试。'
}

function getCompatibilityMessage(overview: DataManagementOverviewResult | null): string | null {
  if (overview?.compatibilityMode === 'missing-handler') {
    return '当前窗口里的主进程还没有注册数据管理 IPC。通常是应用未完整重启：请关闭应用并重新打开，完整概览会出现。'
  }

  return null
}

export function DataManagementView() {
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
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-stone-200 bg-[#f7f5f2] text-stone-900"
      data-testid="data-management-view"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {overviewQuery.isPending && !overview ? (
          <div className="border-t border-stone-200 px-5 py-8 text-sm text-stone-500 sm:px-6">正在加载数据概览…</div>
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">数据管理</div>
                  <p className="mt-1 text-[13px] leading-5 text-stone-500">这里只保留数据量、内容清理和备份入口；运行状态统一放到设置页面里。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FlatButton
                    disabled={busyAction !== null}
                    onClick={() => {
                      void runAction('open-data-directory', async () => {
                        await changbu.settings.openDataDirectory()
                        toast('success', '已打开数据目录。')
                      })
                    }}
                  >
                    打开数据目录
                  </FlatButton>
                  <FlatButton
                    disabled={busyAction !== null}
                    onClick={() => {
                      void runAction('open-settings-directory', async () => {
                        await changbu.settings.openSettingsDirectory()
                        toast('success', '已打开设置目录。')
                      })
                    }}
                  >
                    打开设置目录
                  </FlatButton>
                  <FlatButton
                    quiet
                    disabled={busyAction !== null}
                    onClick={() => {
                      void handleManualRefresh()
                    }}
                  >
                    刷新
                  </FlatButton>
                </div>
              </div>

              <div className="mt-3 overflow-hidden border border-stone-200">
                <div className="border-b border-stone-200 px-3 py-2.5 sm:px-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">总览</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-stone-900">当前数据量</div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-stone-200 md:grid-cols-3 xl:grid-cols-6" data-testid="data-management-metrics">
                  <MetricCell label="块" value={formatCount(overview.totalBlockCount)} hint="主内容块数量" />
                  <MetricCell label="笔记本" value={formatCount(overview.totalNotebookCount)} hint="笔记本与结构容器" />
                  <MetricCell label="快照" value={formatCount(overview.totalSnapshotCount)} hint="文档快照总数" />
                  <MetricCell label="附件" value={formatCount(overview.totalAttachmentCount)} hint="已登记附件记录" />
                  <MetricCell label="向量" value={formatCount(overview.totalVectorCount)} hint="已写入向量索引" />
                  <MetricCell label="日期" value={formatCount(cleanupDayCount)} hint="当前仍有内容的日期" />
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 px-5 py-5 sm:px-6">
              <SectionHeader
                eyebrow="内容清理"
                title="按天浏览并批量删除"
                description="这个功能放在数据管理里，不再放到时间轴。左侧选日期，右侧直接清理当天块内容，适合集中删除没用的话。"
              />

              <div className="mt-4 grid h-[min(62vh,680px)] min-h-[460px] border-y border-stone-200 xl:grid-cols-[280px_minmax(0,1fr)] xl:divide-x xl:divide-stone-200">
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <div className="border-b border-stone-200 px-4 py-4 sm:px-5">
                    <div className="text-sm font-semibold text-stone-900">最近有内容的日期</div>
                    <p className="mt-1 text-sm leading-6 text-stone-500">这里只列出当前仍有块的日期。选中后可在右侧多选并删除。</p>
                  </div>

                  {cleanupDaysQuery.isPending && cleanupDays.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-stone-500 sm:px-5">正在整理可清理的日期…</div>
                  ) : null}

                  {cleanupDaysQuery.isError ? (
                    <div className="border-t border-rose-200 bg-rose-50/70 px-4 py-4 text-sm text-rose-700 sm:px-5">
                      {getErrorMessage(cleanupDaysQuery.error)}
                    </div>
                  ) : null}

                  {!cleanupDaysQuery.isPending && !cleanupDaysQuery.isError && cleanupDays.length === 0 ? (
                    <div className="px-4 py-6 text-sm leading-6 text-stone-500 sm:px-5">当前没有可清理的块内容。</div>
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
                      选择左侧某一天后，这里会显示当天全部块，支持多选和批量删除。
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 px-5 py-5 sm:px-6">
              <SectionHeader
                eyebrow="备份与目录"
                title="导出、导入与本地位置"
                description="备份相关操作保留在这里；维护工具已移到设置里的高级设置。"
              />

              <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900">备份与恢复</div>
                  <p className="mt-1 text-sm leading-6 text-stone-500">Markdown 适合人工查看，JSON 适合完整迁移与恢复；这里导出的 JSON 会连同设置快照一起保存。导入前会先给你预览，不直接落盘。</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('export-markdown', async () => {
                          const result = await changbu.exports.markdown({ includeAttachments: true })

                          if (!result) {
                            toast('info', '已取消 Markdown 导出。')
                            return
                          }

                          toast('success', `Markdown 已导出到 ${result.path}，共 ${formatCount(result.count)} 个块。`)
                        })
                      }}
                    >
                      导出 Markdown
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('export-json', async () => {
                          const result = await changbu.exports.json({ includeAttachments: true, includeSettings: true })

                          if (!result) {
                            toast('info', '已取消 JSON 备份。')
                            return
                          }

                          toast('success', `完整 JSON 备份已导出到 ${result.path}，共 ${formatCount(result.count)} 个块，并包含设置快照。`)
                        })
                      }}
                    >
                      导出 JSON
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('preview-import-markdown', async () => {
                          const preview = await changbu.imports.previewMarkdown()

                          if (!preview) {
                            setImportPreview(null)
                            toast('info', '已取消 Markdown 导入。')
                            return
                          }

                          setImportPreview(preview)
                        })
                      }}
                    >
                      加载 Markdown
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('preview-import-json', async () => {
                          const preview = await changbu.imports.previewJson()

                          if (!preview) {
                            setImportPreview(null)
                            toast('info', '已取消 JSON 导入。')
                            return
                          }

                          setImportPreview(preview)
                        })
                      }}
                    >
                      加载 JSON
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
                            toast('success', `导入完成，共导入 ${formatCount(result.imported)} 个块。`)
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
                  <div className="text-sm font-semibold text-stone-900">目录与路径</div>
                  <p className="mt-1 text-sm leading-6 text-stone-500">直接打开目录，或快速确认当前数据库与设置文件位置。</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('open-data-directory', async () => {
                          await changbu.settings.openDataDirectory()
                          toast('success', '已打开数据目录。')
                        })
                      }}
                    >
                      打开数据目录
                    </FlatButton>
                    <FlatButton
                      disabled={busyAction !== null}
                      onClick={() => {
                        void runAction('open-settings-directory', async () => {
                          await changbu.settings.openSettingsDirectory()
                          toast('success', '已打开设置目录。')
                        })
                      }}
                    >
                      打开设置目录
                    </FlatButton>
                  </div>
                  <div className="mt-4 border-t border-stone-200 pt-2">
                    <InfoRow label="数据目录" value={overview.dataDirectory} monospace />
                    <InfoRow label="数据库文件" value={overview.databasePath} monospace />
                    <InfoRow label="设置目录" value={overview.settingsDirectory} monospace />
                    <InfoRow label="设置文件" value={overview.settingsFilePath} monospace />
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
