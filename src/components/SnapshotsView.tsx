import { useEffect, useMemo, useRef, useState } from 'react'

import type { ExportOptions, ImportConflictStrategy, ImportPreview, Snapshot, SnapshotUpdateInput, Tag } from '../../shared/types'
import { compareText, formatDateByLanguage } from '../i18n/locale'
import { useI18n } from '../i18n/useI18n'
import { MarkdownContent } from './MarkdownContent'
import { MarkdownTextarea } from './MarkdownTextarea'
import { useToast } from './toast-context'

interface SnapshotsViewProps {
  snapshots: Snapshot[]
  selectedSnapshotId: string | null
  snapshotQuery: string
  importPreview: ImportPreview | null
  onSnapshotQueryChange: (value: string) => void
  onSelectSnapshot: (snapshotId: string) => void
  onUpdateSnapshot: (snapshotId: string, patch: SnapshotUpdateInput) => Promise<void>
  onRemoveSnapshot: (snapshotId: string) => Promise<void>
  onExportMarkdown: (options: ExportOptions) => Promise<void>
  onExportJson: (options: ExportOptions) => Promise<void>
  onPreviewMarkdownImport: () => Promise<void>
  onPreviewJsonImport: () => Promise<void>
  onConfirmImport: (strategy: ImportConflictStrategy) => Promise<void>
  onDismissImportPreview: () => void
}

function formatSnapshotTime(value: string): string {
  return formatDateByLanguage(new Date(value), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getSnapshotPreview(content: string): string {
  return content
    .replace(/[#>*`_[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function isSnapshotEdited(snapshot: Snapshot): boolean {
  return snapshot.updatedAt !== snapshot.createdAt
}

const SUPPRESSED_FILTER_TAGS = new Set(['TODO', '重要', '临时', '归档'])
const SNAPSHOT_TAG_PREVIEW_LIMIT = 3

function ToolButton({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
        primary
          ? 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600 disabled:border-violet-200 disabled:bg-violet-200 disabled:text-white'
          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400'
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
  onUpdateSnapshot,
  onRemoveSnapshot,
  onExportMarkdown,
  onExportJson,
  onPreviewMarkdownImport,
  onPreviewJsonImport,
  onConfirmImport,
  onDismissImportPreview,
}: SnapshotsViewProps) {
  const { language, t } = useI18n()
  const { toast } = useToast()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const previousSelectedSnapshotIdRef = useRef<string | null>(null)

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots],
  )
  const selectedSnapshotKey = selectedSnapshot?.id ?? null
  const selectedSnapshotTopic = selectedSnapshot?.topic ?? ''
  const selectedSnapshotContent = selectedSnapshot?.content ?? ''

  useEffect(() => {
    if (previousSelectedSnapshotIdRef.current === selectedSnapshotKey) {
      return
    }

    previousSelectedSnapshotIdRef.current = selectedSnapshotKey

    if (!selectedSnapshotKey) {
      setIsEditing(false)
      setTopicDraft('')
      setContentDraft('')
      return
    }

    setIsEditing(false)
    setTopicDraft(selectedSnapshotTopic)
    setContentDraft(selectedSnapshotContent)
  }, [selectedSnapshotContent, selectedSnapshotKey, selectedSnapshotTopic])

  useEffect(() => {
    if (!selectedSnapshotKey || isEditing) {
      return
    }

    setTopicDraft(selectedSnapshotTopic)
    setContentDraft(selectedSnapshotContent)
  }, [isEditing, selectedSnapshotContent, selectedSnapshotKey, selectedSnapshotTopic])

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

        return compareText(left.name, right.name)
      })
      .slice(0, 24)
  }, [selectedTags, snapshots])

  async function handleCopySelectedSnapshot() {
    if (!selectedSnapshot) {
      return
    }

    try {
      await navigator.clipboard.writeText(selectedSnapshot.content)
      toast('success', t('snapshots.copied'))
    } catch {
      toast('error', t('snapshots.copyFailed'))
    }
  }

  function handleBeginEdit() {
    if (!selectedSnapshot) {
      return
    }

    setTopicDraft(selectedSnapshot.topic)
    setContentDraft(selectedSnapshot.content)
    setIsEditing(true)
  }

  function handleCancelEdit() {
    if (selectedSnapshot) {
      setTopicDraft(selectedSnapshot.topic)
      setContentDraft(selectedSnapshot.content)
    } else {
      setTopicDraft('')
      setContentDraft('')
    }

    setIsEditing(false)
  }

  async function handleSaveEditedSnapshot() {
    if (!selectedSnapshot || isSavingEdit) {
      return
    }

    setIsSavingEdit(true)

    try {
      await onUpdateSnapshot(selectedSnapshot.id, {
        topic: topicDraft,
        content: contentDraft,
      })
      setIsEditing(false)
    } finally {
      setIsSavingEdit(false)
    }
  }

  function toggleTag(tagName: string) {
    setSelectedTags((current) =>
      current.includes(tagName) ? current.filter((name) => name !== tagName) : [...current, tagName],
    )
  }

  const saveDisabled = !topicDraft.trim() || !contentDraft.trim() || isSavingEdit

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 self-stretch flex-col overflow-hidden border-t border-stone-200 bg-[#f7f5f2] text-stone-900 md:flex-row"
      data-testid="snapshots-layout"
    >
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-stone-200 bg-[#f6f4f1] md:h-full md:w-[340px] md:border-b-0 md:border-r">
        <div className="px-4 pb-4 pt-5 sm:px-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.title')}</div>
          <h2 className="mt-3 text-[24px] font-semibold text-stone-900">{t('snapshots.browseTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">{t('snapshots.browseHint')}</p>

          <div className="mt-4">
            <label className="block text-xs font-medium text-stone-500" htmlFor="snapshot-query">
              {t('snapshots.search')}
            </label>
            <input
              id="snapshot-query"
              value={snapshotQuery}
              onChange={(event) => onSnapshotQueryChange(event.target.value)}
              placeholder={t('snapshots.searchPlaceholder')}
              className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
            />
          </div>

          <div className="mt-3 text-xs text-stone-500">
            {selectedTags.length > 0
              ? t('snapshots.countWithTags', { count: snapshots.length, tagCount: selectedTags.length })
              : t('snapshots.count', { count: snapshots.length })}
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
                      <span className="shrink-0 text-[11px] text-stone-400">{t('snapshots.blockCount', { count: snapshot.blockIds.length })}</span>
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
                ? t('snapshots.emptyByQuery', { query: snapshotQuery })
                : t('snapshots.emptyNoData')}
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 px-4 py-4 sm:px-5" data-testid="snapshots-tools">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.exportBackup')}</div>
              <div className="mt-2 text-sm font-semibold text-stone-900">{t('snapshots.filterImportExportTitle')}</div>
              <p className="mt-1 text-xs leading-5 text-stone-500">{t('snapshots.filterImportExportHint')}</p>
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
                {t('snapshots.clearFilters')}
              </button>
            ) : null}
          </div>

          <div className="mt-4 border-t border-stone-200 pt-4" data-testid="snapshots-tag-filter-section">
            <div className="text-xs font-medium text-stone-500">{t('snapshots.tagFilter')}</div>
            <p className="mt-1 text-xs leading-5 text-stone-500">{t('snapshots.tagFilterHint')}</p>
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
                {snapshots.length > 0 ? t('snapshots.tagFilterEmpty') : t('snapshots.tagFilterNoTags')}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-stone-200 pt-4">
            <div className="text-xs font-medium text-stone-500">{t('snapshots.importExport')}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolButton primary onClick={() => { void onExportMarkdown(exportOptions) }}>
                {t('snapshots.exportMarkdown')}
              </ToolButton>
              <ToolButton onClick={() => { void onExportJson(exportOptions) }}>{t('snapshots.exportJson')}</ToolButton>
              <ToolButton onClick={() => { void onPreviewMarkdownImport() }}>{t('snapshots.importMarkdown')}</ToolButton>
              <ToolButton onClick={() => { void onPreviewJsonImport() }}>{t('snapshots.importJson')}</ToolButton>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-stone-500">{t('snapshots.startDate')}</span>
              <input
                aria-label={t('snapshots.startDate')}
                type="date"
                value={dateRange.start}
                onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-500">{t('snapshots.endDate')}</span>
              <input
                aria-label={t('snapshots.endDate')}
                type="date"
                value={dateRange.end}
                onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
              />
            </label>
          </div>

          {importPreview ? (
            <div className="mt-4 border-t border-amber-200 pt-4" data-testid="snapshots-import-preview">
              <div className="text-sm font-semibold text-amber-900">{t('snapshots.importPreview')}</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                {t('snapshots.importPreviewSummary', {
                  format: importPreview.format.toUpperCase(),
                  files: importPreview.totalFiles,
                  blocks: importPreview.totalBlocks,
                  conflicts: importPreview.conflicts,
                })}
              </div>
              {importPreview.includesSettings ? (
                <div className="mt-1 text-xs leading-5 text-amber-800">
                  {t('snapshots.importPreviewSettings', { count: importPreview.settingsEntryCount ?? 0 })}
                </div>
              ) : null}
              <div className="mt-3 space-y-1 text-xs leading-5 text-amber-800">
                {importPreview.samples.map((sample) => (
                  <p key={`${sample.filename}-${sample.preview}`}>{sample.filename}{language === 'en' ? ': ' : '：'}{sample.preview}</p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {importPreview.conflicts > 0 ? (
                  <>
                    <ToolButton onClick={() => { void onConfirmImport('skip_all') }}>{t('snapshots.skipConflicts')}</ToolButton>
                    <ToolButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                      {t('snapshots.overwriteConflicts')}
                    </ToolButton>
                  </>
                ) : (
                  <ToolButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>{t('snapshots.confirmImport')}</ToolButton>
                )}
                <ToolButton onClick={onDismissImportPreview}>{t('snapshots.cancel')}</ToolButton>
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
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.reading')}</div>
                  {isEditing ? (
                    <label className="mt-3 block">
                      <span className="text-xs font-medium text-stone-500">{t('snapshots.editTopic')}</span>
                      <input
                        value={topicDraft}
                        onChange={(event) => setTopicDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        placeholder={t('snapshots.editTopicPlaceholder')}
                        className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[28px] font-semibold leading-tight text-stone-900 outline-none transition focus:border-violet-400 focus:bg-white sm:text-[32px]"
                      />
                    </label>
                  ) : (
                    <h3 className="mt-3 text-[28px] font-semibold leading-tight text-stone-900 sm:text-[32px]">
                      {selectedSnapshot.topic}
                    </h3>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-stone-500">
                    <span>{formatSnapshotTime(selectedSnapshot.createdAt)}</span>
                    {isSnapshotEdited(selectedSnapshot) ? <span>{t('snapshots.editedAt', { time: formatSnapshotTime(selectedSnapshot.updatedAt) })}</span> : null}
                    <span>{t('snapshots.references', { count: selectedSnapshot.blockIds.length })}</span>
                    {selectedSnapshot.notebookTitle ? <span>{t('snapshots.fromNotebook', { title: selectedSnapshot.notebookTitle })}</span> : null}
                  </div>
                  <div className="mt-4 border-t border-stone-200 pt-4">
                    <div className="text-xs font-medium text-stone-500">{t('snapshots.tags')}</div>
                    {selectedSnapshot.tags && selectedSnapshot.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedSnapshot.tags.map((tag) => (
                          <InlineTag key={`${selectedSnapshot.id}-${tag.id}`} name={tag.name} accent />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-stone-500">{t('snapshots.tagsEmpty')}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <ToolButton onClick={handleCancelEdit} disabled={isSavingEdit}>{t('snapshots.cancel')}</ToolButton>
                      <ToolButton primary onClick={() => { void handleSaveEditedSnapshot() }} disabled={saveDisabled}>
                        {isSavingEdit ? t('snapshots.saving') : t('snapshots.save')}
                      </ToolButton>
                    </>
                  ) : (
                    <>
                      <ToolButton onClick={handleBeginEdit}>{t('snapshots.edit')}</ToolButton>
                      <ToolButton onClick={() => { void handleCopySelectedSnapshot() }}>{t('snapshots.copyFull')}</ToolButton>
                      <ToolButton onClick={() => { void onRemoveSnapshot(selectedSnapshot.id) }}>{t('snapshots.delete')}</ToolButton>
                    </>
                  )}
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="mx-auto min-w-0 max-w-4xl break-words">
                {isEditing ? (
                  <label className="block">
                    <span className="text-xs font-medium text-stone-500">{t('snapshots.editContent')}</span>
                    <MarkdownTextarea
                      value={contentDraft}
                      onValueChange={setContentDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          handleCancelEdit()
                        }
                      }}
                      placeholder={t('snapshots.editContentPlaceholder')}
                      rows={18}
                      className="mt-2 min-h-[420px] resize-y rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-900 outline-none transition focus:border-violet-400 focus:bg-white"
                    />
                  </label>
                ) : (
                  <MarkdownContent content={selectedSnapshot.content} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center px-6 py-12">
            <div className="max-w-md text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.title')}</div>
              <h3 className="mt-3 text-2xl font-semibold text-stone-900">
                {snapshotQuery ? t('snapshots.noMatchTitle') : t('snapshots.noSnapshotsTitle')}
              </h3>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                {snapshotQuery
                  ? t('snapshots.noMatchHint')
                  : t('snapshots.noSnapshotsHint')}
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}
