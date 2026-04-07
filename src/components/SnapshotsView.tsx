import { useMemo, useState } from 'react'

import type { ExportOptions, ImportConflictStrategy, ImportPreview, Snapshot, Tag } from '../../shared/types'
import { MarkdownContent } from './MarkdownContent'
import { useToast } from './toast-context'

interface SnapshotsViewProps {
  snapshots: Snapshot[]
  selectedSnapshotId: string | null
  snapshotQuery: string
  importPreview: ImportPreview | null
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

function formatSnapshotTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function getSnapshotPreview(content: string): string {
  return content
    .replace(/[#>*`_[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

const SUPPRESSED_FILTER_TAGS = new Set(['TODO', '重要', '临时', '归档'])
const SNAPSHOT_TAG_PREVIEW_LIMIT = 3

function ToolButton({
  children,
  onClick,
  primary = false,
}: {
  children: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
        primary
          ? 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600'
          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}

function InlineTag({
  name,
  accent = false,
}: {
  name: string
  accent?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        accent ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-stone-200 bg-stone-50 text-stone-600'
      }`}
    >
      {name}
    </span>
  )
}

export function SnapshotsView({
  snapshots,
  selectedSnapshotId,
  snapshotQuery,
  importPreview,
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

  const hasFilters = selectedTags.length > 0 || Boolean(dateRange.start) || Boolean(dateRange.end)

  const snapshotFilterTags = useMemo(() => {
    const activeTagSet = new Set(selectedTags)
    const merged = new Map<string, Tag & { count: number }>()

    for (const snapshot of snapshots) {
      for (const tag of snapshot.tags ?? []) {
        const current = merged.get(tag.name)
        merged.set(tag.name, {
          ...tag,
          count: (current?.count ?? 0) + 1,
        })
      }
    }

    for (const tagName of selectedTags) {
      if (!merged.has(tagName)) {
        merged.set(tagName, {
          id: `snapshot-tag-${tagName}`,
          name: tagName,
          isDefault: false,
          kind: 'detail',
          source: 'manual',
          count: 0,
        })
      }
    }

    const kindRank = { user: 0, detail: 1, category: 2 }

    return Array.from(merged.values())
      .filter((tag) => activeTagSet.has(tag.name) || !SUPPRESSED_FILTER_TAGS.has(tag.name))
      .sort((left, right) => {
        const activeDelta = Number(activeTagSet.has(right.name)) - Number(activeTagSet.has(left.name))
        if (activeDelta !== 0) {
          return activeDelta
        }

        if (left.isDefault !== right.isDefault) {
          return Number(left.isDefault) - Number(right.isDefault)
        }

        if (kindRank[left.kind] !== kindRank[right.kind]) {
          return kindRank[left.kind] - kindRank[right.kind]
        }

        if (right.count !== left.count) {
          return right.count - left.count
        }

        return left.name.localeCompare(right.name, 'zh-Hans-CN')
      })
      .slice(0, 24)
  }, [selectedTags, snapshots])

  async function handleCopySelectedSnapshot() {
    if (!selectedSnapshot) {
      return
    }

    try {
      await navigator.clipboard.writeText(selectedSnapshot.content)
      toast('success', '已复制到剪贴板。')
    } catch {
      toast('error', '复制失败，请稍后重试。')
    }
  }

  function toggleTag(tagName: string) {
    setSelectedTags((current) =>
      current.includes(tagName) ? current.filter((name) => name !== tagName) : [...current, tagName],
    )
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 self-stretch flex-col overflow-hidden border-t border-stone-200 bg-[#f7f5f2] text-stone-900 md:flex-row"
      data-testid="snapshots-layout"
    >
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-stone-200 bg-[#f6f4f1] md:h-full md:w-[340px] md:border-b-0 md:border-r">
        <div className="px-4 pb-4 pt-5 sm:px-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">文档快照</div>
          <h2 className="mt-3 text-[24px] font-semibold text-stone-900">浏览与切换</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">左侧只负责找快照，右侧专心阅读内容。</p>

          <div className="mt-4">
            <label className="block text-xs font-medium text-stone-500" htmlFor="snapshot-query">
              搜索
            </label>
            <input
              id="snapshot-query"
              value={snapshotQuery}
              onChange={(event) => onSnapshotQueryChange(event.target.value)}
              placeholder="搜索快照主题…"
              className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
            />
          </div>

          <div className="mt-3 text-xs text-stone-500">
            共 {snapshots.length} 条快照{selectedTags.length > 0 ? ` · 已选 ${selectedTags.length} 个标签` : ''}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="snapshots-list">
          {snapshots.length > 0 ? (
            snapshots.map((snapshot) => {
              const active = snapshot.id === selectedSnapshot?.id
              const preview = getSnapshotPreview(snapshot.content)

              return (
                <button
                  key={snapshot.id}
                  type="button"
                  onClick={() => onSelectSnapshot(snapshot.id)}
                  data-testid={`snapshot-row-${snapshot.id}`}
                  className={`group relative w-full border-t border-stone-200 px-5 py-4 text-left transition first:border-t-0 ${
                    active ? 'bg-white' : 'hover:bg-white/70'
                  }`}
                >
                  <span className={`absolute left-0 top-0 h-full w-[2px] ${active ? 'bg-violet-500' : 'bg-transparent'}`} />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className={`min-w-0 truncate text-sm font-semibold ${active ? 'text-stone-900' : 'text-stone-700'}`}>
                        {snapshot.topic}
                      </p>
                      <span className="shrink-0 text-[11px] text-stone-400">{snapshot.blockIds.length} 块</span>
                    </div>
                    {preview ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{preview}</p> : null}
                    <p className="mt-2 text-[11px] leading-5 text-stone-400">
                      {formatSnapshotTime(snapshot.createdAt)}
                      {snapshot.notebookTitle ? ` · ${snapshot.notebookTitle}` : ''}
                    </p>
                    {snapshot.tags && snapshot.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {snapshot.tags.slice(0, SNAPSHOT_TAG_PREVIEW_LIMIT).map((tag) => (
                          <InlineTag key={`${snapshot.id}-${tag.id}`} name={tag.name} accent={active} />
                        ))}
                        {snapshot.tags.length > SNAPSHOT_TAG_PREVIEW_LIMIT ? (
                          <span className="inline-flex items-center text-[11px] text-stone-400">
                            +{snapshot.tags.length - SNAPSHOT_TAG_PREVIEW_LIMIT}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-5 py-8 text-sm leading-6 text-stone-500">
              {snapshotQuery
                ? `没有找到与“${snapshotQuery}”相关的快照。`
                : '还没有保存的文档快照。先在搜索生成页产出文档，再点击“保存快照”。'}
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 px-4 py-4 sm:px-5" data-testid="snapshots-tools">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">导出与备份</div>
              <div className="mt-2 text-sm font-semibold text-stone-900">标签筛选、导入与导出</div>
              <p className="mt-1 text-xs leading-5 text-stone-500">标签筛选始终显示；导入导出依然保留在次级区域，不抢主阅读区。</p>
            </div>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedTags([])
                  setDateRange({ start: '', end: '' })
                }}
                className="shrink-0 text-xs font-medium text-stone-500 transition hover:text-stone-900"
              >
                清空筛选
              </button>
            ) : null}
          </div>

          <div className="mt-4 border-t border-stone-200 pt-4" data-testid="snapshots-tag-filter-section">
            <div className="text-xs font-medium text-stone-500">标签筛选</div>
            <p className="mt-1 text-xs leading-5 text-stone-500">这里显示当前快照真实关联的标签，并按连接图同样的优先级排序。</p>
            {snapshotFilterTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshotFilterTags.map((tag) => {
                  const active = selectedTags.includes(tag.name)

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {tag.name}
                      {tag.count > 0 ? <span className="ml-1 opacity-60">{tag.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-2 text-xs leading-5 text-stone-500">
                {snapshots.length > 0 ? '当前快照引用块里还没有可用于筛选导出的标签。' : '暂无可用标签。'}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-stone-200 pt-4">
            <div className="text-xs font-medium text-stone-500">导入与导出</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolButton primary onClick={() => { void onExportMarkdown(exportOptions) }}>
                导出 Markdown
              </ToolButton>
              <ToolButton onClick={() => { void onExportJson(exportOptions) }}>导出 JSON</ToolButton>
              <ToolButton onClick={() => { void onPreviewMarkdownImport() }}>导入 Markdown</ToolButton>
              <ToolButton onClick={() => { void onPreviewJsonImport() }}>导入 JSON</ToolButton>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-stone-500">起始日期</span>
              <input
                aria-label="起始日期"
                type="date"
                value={dateRange.start}
                onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-500">结束日期</span>
              <input
                aria-label="结束日期"
                type="date"
                value={dateRange.end}
                onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
              />
            </label>
          </div>

          {importPreview ? (
            <div className="mt-4 border-t border-amber-200 pt-4" data-testid="snapshots-import-preview">
              <div className="text-sm font-semibold text-amber-900">导入预览</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                {importPreview.format.toUpperCase()} · {importPreview.totalFiles} 个文件 / {importPreview.totalBlocks} 个块
                {` · 冲突 ${importPreview.conflicts}`}
              </div>
              <div className="mt-3 space-y-1 text-xs leading-5 text-amber-800">
                {importPreview.samples.map((sample) => (
                  <p key={`${sample.filename}-${sample.preview}`}>{sample.filename}：{sample.preview}</p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {importPreview.conflicts > 0 ? (
                  <>
                    <ToolButton onClick={() => { void onConfirmImport('skip_all') }}>全部跳过冲突</ToolButton>
                    <ToolButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                      全部覆盖冲突
                    </ToolButton>
                  </>
                ) : (
                  <ToolButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>确认导入</ToolButton>
                )}
                <ToolButton onClick={onDismissImportPreview}>取消</ToolButton>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {selectedSnapshot ? (
          <>
            <header className="border-b border-stone-200 px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">阅读</div>
                  <h3 className="mt-3 text-[28px] font-semibold leading-tight text-stone-900 sm:text-[32px]">
                    {selectedSnapshot.topic}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-stone-500">
                    <span>{formatSnapshotTime(selectedSnapshot.createdAt)}</span>
                    <span>引用 {selectedSnapshot.blockIds.length} 个块</span>
                    {selectedSnapshot.notebookTitle ? <span>来自 {selectedSnapshot.notebookTitle}</span> : null}
                  </div>
                  <div className="mt-4 border-t border-stone-200 pt-4">
                    <div className="text-xs font-medium text-stone-500">标签</div>
                    {selectedSnapshot.tags && selectedSnapshot.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedSnapshot.tags.map((tag) => (
                          <InlineTag key={`${selectedSnapshot.id}-${tag.id}`} name={tag.name} accent />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-stone-500">当前快照还没有可显示的关联标签。</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ToolButton onClick={() => { void handleCopySelectedSnapshot() }}>复制全文</ToolButton>
                  <ToolButton onClick={() => { void onRemoveSnapshot(selectedSnapshot.id) }}>删除</ToolButton>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="mx-auto min-w-0 max-w-4xl break-words">
                <MarkdownContent content={selectedSnapshot.content} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center px-6 py-12">
            <div className="max-w-md text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">文档快照</div>
              <h3 className="mt-3 text-2xl font-semibold text-stone-900">
                {snapshotQuery ? '没有匹配的快照' : '还没有文档快照'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                {snapshotQuery
                  ? '换一个关键词，或者清空搜索后查看全部快照。'
                  : '先在搜索生成页生成一篇文档，再点击“保存快照”，这里就会出现可回看的版本。'}
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}
