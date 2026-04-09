import { useEffect, useMemo, useRef, useState } from 'react'

import type { ExportOptions, ImportConflictStrategy, ImportPreview, Snapshot, SnapshotUpdateInput } from '../../shared/types'
import { formatDateByLanguage } from '../i18n/locale'
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

const COMPACT_LAYOUT_MAX_WIDTH = 1080

function getIsCompactLayout(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.innerWidth < COMPACT_LAYOUT_MAX_WIDTH
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

function getPlainSnapshotText(content: string): string {
  return content
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*`~_[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSnapshotPreview(content: string, query: string): string {
  const plain = getPlainSnapshotText(content)

  if (!plain) {
    return ''
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return plain.slice(0, 140)
  }

  const normalizedContent = plain.toLocaleLowerCase()
  const matchIndex = normalizedContent.indexOf(normalizedQuery)
  if (matchIndex === -1) {
    return plain.slice(0, 140)
  }

  const previewStart = Math.max(0, matchIndex - 44)
  const previewEnd = Math.min(plain.length, matchIndex + normalizedQuery.length + 72)

  return `${previewStart > 0 ? '…' : ''}${plain.slice(previewStart, previewEnd)}${previewEnd < plain.length ? '…' : ''}`
}

function isSnapshotEdited(snapshot: Snapshot): boolean {
  return snapshot.updatedAt !== snapshot.createdAt
}

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

function MetaItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-stone-700">{value}</dd>
    </div>
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
  const [isCompactLayout, setIsCompactLayout] = useState(getIsCompactLayout)
  const [compactPane, setCompactPane] = useState<'list' | 'detail'>(() => (getIsCompactLayout() ? 'detail' : 'list'))
  const [toolsExpanded, setToolsExpanded] = useState(Boolean(importPreview))
  const [isEditing, setIsEditing] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const previousSelectedSnapshotIdRef = useRef<string | null>(null)
  const previousCompactSnapshotIdRef = useRef<string | null>(null)

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots],
  )
  const selectedSnapshotKey = selectedSnapshot?.id ?? null
  const selectedSnapshotTopic = selectedSnapshot?.topic ?? ''
  const selectedSnapshotContent = selectedSnapshot?.content ?? ''

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(getIsCompactLayout())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!importPreview) {
      return
    }

    setToolsExpanded(true)
  }, [importPreview])

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

  useEffect(() => {
    if (!isCompactLayout) {
      return
    }

    if (!selectedSnapshotKey) {
      setCompactPane('list')
      previousCompactSnapshotIdRef.current = null
      return
    }

    if (previousCompactSnapshotIdRef.current === selectedSnapshotKey) {
      return
    }

    previousCompactSnapshotIdRef.current = selectedSnapshotKey
    setCompactPane('detail')
  }, [isCompactLayout, selectedSnapshotKey])

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

  function handleSelectSnapshot(snapshotId: string) {
    onSelectSnapshot(snapshotId)

    if (isCompactLayout) {
      setCompactPane('detail')
    }
  }

  const exportOptions: ExportOptions = {
    includeAttachments: true,
  }

  const saveDisabled = !topicDraft.trim() || !contentDraft.trim() || isSavingEdit
  const showListPane = !isCompactLayout || compactPane === 'list'
  const showDetailPane = !isCompactLayout || compactPane === 'detail'
  const compactToolsLabel = compactPane !== 'list'
    ? t('snapshots.toolsTab')
    : toolsExpanded
      ? t('snapshots.hideTools')
      : t('snapshots.toolsTab')

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 self-stretch flex-col overflow-hidden border-t border-stone-200 bg-white text-stone-900"
      data-testid="snapshots-layout"
    >
      {isCompactLayout ? (
        <div className="border-b border-stone-200 bg-white px-3 py-2 sm:px-4" data-testid="snapshots-compact-switcher">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-stone-200 bg-white p-0.5 shadow-[0_1px_2px_rgba(28,25,23,0.05)]">
              <button
                type="button"
                onClick={() => setCompactPane('list')}
                className={`rounded-full px-2.5 py-1 text-[12px] font-medium leading-5 transition ${
                  compactPane === 'list' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {t('snapshots.resultsTab')}
              </button>
              <button
                type="button"
                onClick={() => setCompactPane('detail')}
                disabled={!selectedSnapshot}
                className={`rounded-full px-2.5 py-1 text-[12px] font-medium leading-5 transition ${
                  compactPane === 'detail'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100 disabled:text-stone-300'
                }`}
              >
                {t('snapshots.readingTab')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setCompactPane('list')
                setToolsExpanded((current) => (compactPane === 'list' ? !current : true))
              }}
              className={`ml-auto rounded-full px-2.5 py-1 text-[12px] font-medium leading-5 transition ${
                compactPane === 'list' && toolsExpanded
                  ? 'bg-white text-stone-700 shadow-[0_1px_2px_rgba(28,25,23,0.05)]'
                  : 'text-stone-500 hover:bg-white hover:text-stone-900'
              }`}
            >
              {compactToolsLabel}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`min-h-0 flex-1 ${isCompactLayout ? 'flex flex-col' : 'grid grid-cols-[minmax(320px,380px)_minmax(0,1fr)]'}`}>
        {showListPane ? (
          <aside
            className={`flex min-h-0 flex-col bg-white ${isCompactLayout ? 'border-b border-stone-200' : 'border-r border-stone-200'}`}
            data-testid="snapshots-browser-pane"
          >
            <div className="border-b border-stone-200 px-4 py-3 sm:px-6" data-testid="snapshots-search-bar">
              <input
                id="snapshot-query"
                aria-label={t('snapshots.search')}
                value={snapshotQuery}
                onChange={(event) => onSnapshotQueryChange(event.target.value)}
                placeholder={t('snapshots.searchPlaceholder')}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                <span>{t('snapshots.count', { count: snapshots.length })}</span>
                <span>{t('snapshots.searchScopeHint')}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="snapshots-list">
              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => {
                  const active = snapshot.id === selectedSnapshot?.id
                  const preview = getSnapshotPreview(snapshot.content, snapshotQuery)

                  return (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => handleSelectSnapshot(snapshot.id)}
                      data-testid={`snapshot-row-${snapshot.id}`}
                      className={`group relative w-full border-b border-stone-200 px-5 py-4 text-left transition ${
                        active ? 'bg-white' : 'hover:bg-white/70'
                      }`}
                    >
                      <span className={`absolute left-0 top-0 h-full w-[2px] ${active ? 'bg-violet-500' : 'bg-transparent'}`} />
                      <div className="min-w-0">
                        <p className={`min-w-0 truncate text-[15px] font-semibold ${active ? 'text-stone-900' : 'text-stone-700'}`}>
                          {snapshot.topic}
                        </p>
                        {preview ? (
                          <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-stone-500">
                            {preview}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-stone-400">
                          {snapshot.notebookTitle ? <span>{snapshot.notebookTitle}</span> : null}
                          <span>{t('snapshots.blockCount', { count: snapshot.blockIds.length })}</span>
                          <span>{formatSnapshotTime(isSnapshotEdited(snapshot) ? snapshot.updatedAt : snapshot.createdAt)}</span>
                        </div>
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

            <div className="border-t border-stone-200 px-4 py-4 sm:px-6" data-testid="snapshots-tools">
              <button
                type="button"
                onClick={() => setToolsExpanded((current) => !current)}
                className="w-full text-left"
                aria-expanded={toolsExpanded}
                data-testid="snapshots-tools-toggle"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.exportBackup')}</div>
                    <div className="mt-2 text-sm font-semibold text-stone-900">{t('snapshots.toolsTitle')}</div>
                    <p className="mt-1 text-xs leading-5 text-stone-500">{t('snapshots.toolsHint')}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-stone-500">
                    {toolsExpanded ? t('snapshots.hideTools') : t('snapshots.showTools')}
                  </span>
                </div>
              </button>

              {toolsExpanded ? (
                <div className="mt-4 border-t border-stone-200 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <ToolButton primary onClick={() => { void onExportMarkdown(exportOptions) }}>
                      {t('snapshots.exportMarkdown')}
                    </ToolButton>
                    <ToolButton onClick={() => { void onExportJson(exportOptions) }}>{t('snapshots.exportJson')}</ToolButton>
                    <ToolButton onClick={() => { void onPreviewMarkdownImport() }}>{t('snapshots.importMarkdown')}</ToolButton>
                    <ToolButton onClick={() => { void onPreviewJsonImport() }}>{t('snapshots.importJson')}</ToolButton>
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
              ) : null}
            </div>
          </aside>
        ) : null}

        {showDetailPane ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white" data-testid="snapshots-reading-pane">
            {selectedSnapshot ? (
              <>
                {isEditing ? (
                  <header className="border-b border-stone-200 px-6 py-5 sm:px-8">
                    {isCompactLayout ? (
                      <button
                        type="button"
                        onClick={() => setCompactPane('list')}
                        className="mb-4 text-sm font-medium text-stone-500 transition hover:text-stone-900"
                      >
                        {t('snapshots.backToResults')}
                      </button>
                    ) : null}

                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{t('snapshots.reading')}</div>
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
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <ToolButton onClick={handleCancelEdit} disabled={isSavingEdit}>{t('snapshots.cancel')}</ToolButton>
                        <ToolButton primary onClick={() => { void handleSaveEditedSnapshot() }} disabled={saveDisabled}>
                          {isSavingEdit ? t('snapshots.saving') : t('snapshots.save')}
                        </ToolButton>
                      </div>
                    </div>
                  </header>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 sm:px-8 sm:py-4">
                  <div className="mx-auto w-full max-w-4xl">
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
                      <>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3" data-testid="snapshots-reading-toolbar">
                          {isCompactLayout ? (
                            <button
                              type="button"
                              onClick={() => setCompactPane('list')}
                              className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
                            >
                              {t('snapshots.backToResults')}
                            </button>
                          ) : (
                            <div />
                          )}

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <ToolButton onClick={handleBeginEdit}>{t('snapshots.edit')}</ToolButton>
                            <ToolButton onClick={() => { void handleCopySelectedSnapshot() }}>{t('snapshots.copyFull')}</ToolButton>
                            <ToolButton onClick={() => { void onRemoveSnapshot(selectedSnapshot.id) }}>{t('snapshots.delete')}</ToolButton>
                          </div>
                        </div>

                        <div className="min-w-0 break-words" data-testid="snapshots-content-section">
                          <MarkdownContent content={selectedSnapshot.content} />
                        </div>

                        <section className="mt-10 border-t border-stone-200 pt-6" data-testid="snapshots-reference-section">
                          <h4 className="text-sm font-semibold text-stone-900">{t('snapshots.referenceSectionTitle')}</h4>
                          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <MetaItem label={t('snapshots.createdLabel')} value={formatSnapshotTime(selectedSnapshot.createdAt)} />
                            <MetaItem
                              label={t('snapshots.updatedLabel')}
                              value={isSnapshotEdited(selectedSnapshot) ? formatSnapshotTime(selectedSnapshot.updatedAt) : t('snapshots.notEditedYet')}
                            />
                            <MetaItem label={t('snapshots.referencesLabel')} value={t('snapshots.references', { count: selectedSnapshot.blockIds.length })} />
                            <MetaItem
                              label={t('snapshots.sourceLabel')}
                              value={selectedSnapshot.notebookTitle ?? t('snapshots.sourceEmpty')}
                            />
                          </dl>
                        </section>
                      </>
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
        ) : null}
      </div>
    </section>
  )
}
