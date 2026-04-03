import { useMemo, useState } from 'react'

import type { ExportOptions, ImportConflictStrategy, ImportPreview, Snapshot, TagSuggestion } from '../../shared/types'
import { MarkdownContent } from './MarkdownContent'
import { useToast } from './toast-context'

interface SnapshotsViewProps {
  snapshots: Snapshot[]
  selectedSnapshotId: string | null
  snapshotQuery: string
  importPreview: ImportPreview | null
  availableTags: TagSuggestion[]
  onSnapshotQueryChange: (value: string) => void
  onSelectSnapshot: (snapshotId: string) => void
  onRemoveSnapshot: (snapshotId: string) => Promise<void>
  onExportMarkdown: (options: ExportOptions) => Promise<void>
  onExportJson: (options: ExportOptions) => Promise<void>
  onPreviewMarkdownImport: () => Promise<void>
  onPreviewJsonImport: () => Promise<void>
  onConfirmImport: (strategy: ImportConflictStrategy) => Promise<void>
  onDismissImportPreview: () => void
}

export function SnapshotsView({
  snapshots,
  selectedSnapshotId,
  snapshotQuery,
  importPreview,
  availableTags,
  onSnapshotQueryChange,
  onSelectSnapshot,
  onRemoveSnapshot,
  onExportMarkdown,
  onExportJson,
  onPreviewMarkdownImport,
  onPreviewJsonImport,
  onConfirmImport,
  onDismissImportPreview,
}: SnapshotsViewProps) {
  const { toast } = useToast()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots],
  )

  const exportOptions: ExportOptions = {
    includeAttachments: true,
    tagFilter: selectedTags,
    dateRange: {
      start: dateRange.start || undefined,
      end: dateRange.end || undefined,
    },
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">快照列表</p>

        <input
          value={snapshotQuery}
          onChange={(event) => onSnapshotQueryChange(event.target.value)}
          placeholder="搜索快照主题…"
          className="w-full rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-200"
        />

        <div className="space-y-3 rounded-lg border border-stone-200 bg-white/70 p-3">
          <p className="text-xs font-medium text-stone-500">导出筛选</p>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.slice(0, 18).map((tag) => {
              const active = selectedTags.includes(tag.name)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    setSelectedTags((current) =>
                      current.includes(tag.name) ? current.filter((name) => name !== tag.name) : [...current, tag.name],
                    )
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    active ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
              className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
              className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void onExportMarkdown(exportOptions)
              }}
              className="rounded bg-stone-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-700"
            >
              导出 Markdown
            </button>
            <button
              type="button"
              onClick={() => {
                void onExportJson(exportOptions)
              }}
              className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
            >
              导出 JSON
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void onPreviewMarkdownImport()
              }}
              className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
            >
              导入 Markdown
            </button>
            <button
              type="button"
              onClick={() => {
                void onPreviewJsonImport()
              }}
              className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
            >
              导入 JSON
            </button>
          </div>
        </div>

        {importPreview ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">导入预览</p>
            <div className="mt-2 space-y-1 text-xs text-amber-900">
              <p>
                {importPreview.format.toUpperCase()} · {importPreview.totalFiles} 个文件 / {importPreview.totalBlocks} 个块
              </p>
              <p>冲突数：{importPreview.conflicts}</p>
              {importPreview.samples.map((sample) => (
                <p key={`${sample.filename}-${sample.preview}`} className="text-amber-700">
                  {sample.filename}：{sample.preview}
                </p>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {importPreview.conflicts > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void onConfirmImport('skip_all')
                    }}
                    className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition duration-150 active:scale-[0.97]"
                  >
                    全部跳过冲突
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onConfirmImport('overwrite_all')
                    }}
                    className="rounded border border-stone-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-700 transition duration-150 active:scale-[0.97]"
                  >
                    全部覆盖冲突
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void onConfirmImport('overwrite_all')
                  }}
                  className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition duration-150 active:scale-[0.97]"
                >
                  确认导入
                </button>
              )}
              <button
                type="button"
                onClick={onDismissImportPreview}
                className="rounded border border-stone-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-700 transition duration-150 active:scale-[0.97]"
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {snapshots.map((snapshot) => (
            <button
              key={snapshot.id}
              type="button"
              onClick={() => onSelectSnapshot(snapshot.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                snapshot.id === selectedSnapshot?.id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white/70 hover:bg-stone-50'
              }`}
            >
              <p className="text-sm font-medium">{snapshot.topic}</p>
              <p
                className={`mt-1 text-xs ${
                  snapshot.id === selectedSnapshot?.id ? 'text-white/60' : 'text-stone-400'
                }`}
              >
                {new Date(snapshot.createdAt).toLocaleString('zh-CN')} · 引用 {snapshot.blockIds.length} 个块
                {snapshot.notebookTitle ? ` · ${snapshot.notebookTitle}` : ''}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-lg border border-stone-200 bg-white/70 p-3">
        {selectedSnapshot ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-stone-400">快照内容</p>
                <h3 className="mt-0.5 text-lg font-semibold text-stone-900">{selectedSnapshot.topic}</h3>
                <p className="mt-1 text-xs text-stone-400">
                  {new Date(selectedSnapshot.createdAt).toLocaleString('zh-CN')} · 引用 {selectedSnapshot.blockIds.length} 个块
                  {selectedSnapshot.notebookTitle ? ` · 来自 ${selectedSnapshot.notebookTitle}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(selectedSnapshot.content).then(() => {
                      toast('success', '已复制到剪贴板。')
                    })
                  }}
                  className="rounded border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition duration-150 hover:bg-stone-50 active:scale-[0.97]"
                >
                  复制全文
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onRemoveSnapshot(selectedSnapshot.id)
                  }}
                  className="rounded border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition duration-150 hover:bg-rose-50 active:scale-[0.97]"
                >
                  删除
                </button>
              </div>
            </div>
            <div className="mt-4">
              <MarkdownContent content={selectedSnapshot.content} />
            </div>
          </>
        ) : (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-stone-200 text-sm text-stone-400">
            还没有文档快照。先在搜索生成页产出一篇文档，再点击"保存快照".
          </div>
        )}
      </section>
    </section>
  )
}
