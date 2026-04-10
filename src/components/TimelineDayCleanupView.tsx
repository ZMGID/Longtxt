import { useEffect, useMemo, useState } from 'react'

import type { BlockBatchRemoveResult } from '../../shared/types'
import { useBlocksByDate } from '../hooks/useBlocksByDate'
import { formatClockTime, formatDateKeyLabel } from '../lib/format'
import { useToast } from './toast-context'

interface TimelineDayCleanupViewProps {
  date: string
  onBack?: () => void
  onDeleteBlocks: (ids: string[]) => Promise<BlockBatchRemoveResult>
  embedded?: boolean
}

function stripMarkdownPreview(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '附件')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function TimelineDayCleanupView({
  date,
  onBack,
  onDeleteBlocks,
  embedded = false,
}: TimelineDayCleanupViewProps) {
  const { toast } = useToast()
  const dayQuery = useBlocksByDate(date)
  const blocks = dayQuery.data ?? []
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const availableIds = new Set(blocks.map((block) => block.id))
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)))
  }, [blocks])

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = blocks.length > 0 && selectedIds.length === blocks.length
  const horizontalPadding = embedded ? 'px-4 sm:px-5' : 'px-5 sm:px-6'

  function toggleBlock(blockId: string) {
    setSelectedIds((current) => (current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId]))
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return
    }

    setDeleting(true)

    try {
      const result = await onDeleteBlocks(selectedIds)
      setSelectedIds([])
      setConfirmDelete(false)
      await dayQuery.refetch()
      toast('success', `已删除 ${result.removed} 条内容。`)
    } catch (error) {
      toast('error', error instanceof Error ? error.message : '批量删除失败。')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden text-stone-900 ${
        embedded ? 'bg-transparent' : 'border-t border-stone-200 bg-[#f7f5f2]'
      }`}
      data-testid="timeline-day-cleanup-view"
    >
      <div className={`border-b border-stone-200 ${horizontalPadding} ${embedded ? 'py-4' : 'py-5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">按天清理</div>
            <h3 className={`font-semibold text-stone-900 ${embedded ? 'mt-1 text-[20px]' : 'mt-2 text-[24px]'}`}>
              {formatDateKeyLabel(date, { weekday: true })}
            </h3>
            <p className={`text-sm leading-6 text-stone-500 ${embedded ? 'mt-1' : 'mt-2'}`}>
              {embedded ? '浏览、勾选并批量删除当天块内容。' : '这里会拉取这一天的全部块。你可以浏览、勾选，然后一次性删除没用的话。'}
            </p>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              返回时间线
            </button>
          ) : null}
        </div>
      </div>

      <div className={`border-b border-stone-200 bg-[#f7f5f2] ${horizontalPadding} ${embedded ? 'py-3' : 'py-4'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-stone-500">
            当天共 <span className="font-semibold text-stone-900">{blocks.length}</span> 条，已选 <span className="font-semibold text-stone-900">{selectedIds.length}</span> 条
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(blocks.map((block) => block.id))}
              disabled={blocks.length === 0 || allSelected || deleting}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              全选
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0 || deleting}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              清空选择
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={selectedIds.length === 0 || deleting}
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? '删除中…' : '批量删除'}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {dayQuery.isPending ? (
          <div className={`${horizontalPadding} py-8 text-sm text-stone-500`}>正在加载这一天的内容…</div>
        ) : null}

        {dayQuery.isError ? (
          <div className={`${horizontalPadding} py-8 text-sm text-rose-700`}>{dayQuery.error instanceof Error ? dayQuery.error.message : '加载失败。'}</div>
        ) : null}

        {!dayQuery.isPending && !dayQuery.isError && blocks.length === 0 ? (
          <div className={`${horizontalPadding} py-10 text-sm leading-6 text-stone-500`}>
            {embedded ? '这一天已经没有内容了。你可以改选左侧别的日期。' : '这一天已经没有内容了。你可以返回时间线，或者继续浏览别的日期。'}
          </div>
        ) : null}

        {!dayQuery.isPending && !dayQuery.isError && blocks.length > 0 ? (
          <div>
            {blocks.map((block) => {
              const selected = selectedIdSet.has(block.id)
              const preview = stripMarkdownPreview(block.content)

              return (
                <label
                  key={block.id}
                  className={`flex cursor-pointer gap-4 border-b border-stone-200 ${horizontalPadding} py-4 transition hover:bg-white/70 ${selected ? 'bg-white' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleBlock(block.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-stone-900"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-stone-400">
                      <span>{formatClockTime(block.createdAt)}</span>
                      <span>
                        {block.status === 'ready'
                          ? '已完成'
                          : block.status === 'pending'
                            ? '处理中'
                            : block.status === 'skipped'
                              ? '已跳过'
                              : '异常'}
                      </span>
                      <span>{block.tags.length} 标签</span>
                    </div>
                    <div className="mt-2 line-clamp-3 text-sm leading-6 text-stone-800">{preview || '（空内容）'}</div>
                  </div>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md border border-stone-200 bg-[#fbfaf7] px-5 py-5 shadow-[0_24px_60px_rgba(28,25,23,0.16)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">确认删除</div>
            <h4 className="mt-2 text-[20px] font-semibold text-stone-900">删除 {formatDateKeyLabel(date)} 里选中的内容？</h4>
            <p className="mt-2 text-sm leading-6 text-stone-500">本次将删除 {selectedIds.length} 条内容。删除后不可恢复，相关向量与附件引用也会同步整理。</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleDeleteSelected() }}
                disabled={deleting}
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
