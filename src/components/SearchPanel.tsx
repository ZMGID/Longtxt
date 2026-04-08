import { useEffect, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'

import type { AIExecutionMode, NotebookSummary, SearchResult, TagSuggestion } from '../../shared/types'
import { AddToNotebookMenu } from './AddToNotebookMenu'
import { MarkdownContent } from './MarkdownContent'
import { SearchResultCard } from './SearchResultCard'
import { useToast } from './toast-context'

interface DocumentState {
  status: 'idle' | 'streaming' | 'done' | 'error'
  requestId: string | null
  topic: string
  content: string
  blockIds: string[]
  mode: AIExecutionMode
  error: string | null
}

interface SearchPanelProps {
  query: string
  results: SearchResult[]
  resultsTitle: string
  resultsEmptyHint: string
  tagSuggestions?: TagSuggestion[]
  showResultScore?: boolean
  resultMetaLabel?: string | null
  browseTag: string | null
  searchError: string | null
  searching: boolean
  generating: boolean
  document: DocumentState
  documentReferences: SearchResult[]
  documentReferencesLoading: boolean
  notebooks: NotebookSummary[]
  selectedNotebook: { id: string; title: string } | null
  documentDepositAction: 'create' | 'append' | null
  onQueryChange: (value: string) => void
  onSearch: () => void
  onGenerate: () => void
  onSaveSnapshot: () => void
  onDepositToNewNotebook: () => void
  onDepositToCurrentNotebook: () => void
  onClearBrowseTag: () => void
  onTagClick: (tagName: string) => void
  onJumpToTimeline: (blockId: string) => Promise<boolean>
  jumpingToTimelineBlockId: string | null
  onUpdateResult?: (id: string, content: string) => Promise<void>
  onDeleteResult?: (id: string) => Promise<void>
  onAddTagToResult?: (blockId: string, tagName: string) => Promise<void>
  onRemoveTagFromResult?: (blockId: string, tagId: string) => Promise<void>
  onFindRelatedResult?: (blockId: string) => void
  onAddResultToNotebook: (notebookId: string, blockId: string) => Promise<void>
  onCreateNotebookWithResult: (blockId: string) => Promise<void>
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}

const SEARCH_DOCUMENT_PANEL_MIN_WIDTH = 1320
const SEARCH_DOCUMENT_PANEL_MIN_HEIGHT = 820

function shouldShowSearchDocumentPanel(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  return window.innerWidth >= SEARCH_DOCUMENT_PANEL_MIN_WIDTH && window.innerHeight >= SEARCH_DOCUMENT_PANEL_MIN_HEIGHT
}

export function SearchPanel({
  query,
  results,
  resultsTitle,
  resultsEmptyHint,
  tagSuggestions = [],
  showResultScore = true,
  resultMetaLabel = null,
  browseTag,
  searchError,
  searching,
  generating,
  document,
  documentReferences,
  documentReferencesLoading,
  notebooks,
  selectedNotebook,
  documentDepositAction,
  onQueryChange,
  onSearch,
  onGenerate,
  onSaveSnapshot,
  onDepositToNewNotebook,
  onDepositToCurrentNotebook,
  onClearBrowseTag,
  onTagClick,
  onJumpToTimeline,
  jumpingToTimelineBlockId,
  onUpdateResult,
  onDeleteResult,
  onAddTagToResult,
  onRemoveTagFromResult,
  onFindRelatedResult,
  onAddResultToNotebook,
  onCreateNotebookWithResult,
  inputRef,
}: SearchPanelProps) {
  const { toast } = useToast()
  const [showDocumentPanel, setShowDocumentPanel] = useState(() => shouldShowSearchDocumentPanel())
  const canCopyDocument = document.content.trim().length > 0
  const canShowReferences = document.status === 'done' && canCopyDocument

  useEffect(() => {
    inputRef?.current?.focus()
  }, [inputRef])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function handleResize(): void {
      setShowDocumentPanel(shouldShowSearchDocumentPanel())
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const resultsPane = (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {searchError ? (
        <p className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</p>
      ) : null}

      <p className="shrink-0 px-1 text-xs text-stone-400">{resultsTitle}</p>

      {results.length > 0 ? (
        <div data-testid="search-results-scroll" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <Virtuoso
            style={{ height: '100%' }}
            data={results}
            overscan={320}
            increaseViewportBy={360}
            computeItemKey={(_index, result) => result.block.id}
            itemContent={(_index, result) => (
              <div className="pb-2">
                <SearchResultCard
                  result={result}
                  query={query}
                  editable
                  tagSuggestions={tagSuggestions}
                  onTagClick={onTagClick}
                  onSave={onUpdateResult}
                  onDelete={onDeleteResult}
                  onAddTag={onAddTagToResult}
                  onRemoveTag={onRemoveTagFromResult}
                  onFindRelated={onFindRelatedResult}
                  showScore={showResultScore}
                  metaLabel={resultMetaLabel}
                  headerActions={(
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="跳转到时间轴"
                        title="跳转到时间轴"
                        onClick={() => {
                          void onJumpToTimeline(result.block.id)
                        }}
                        disabled={jumpingToTimelineBlockId !== null}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-stone-500 transition ${
                          jumpingToTimelineBlockId === result.block.id
                            ? 'border-stone-300 bg-white text-stone-900 shadow-sm'
                            : 'border-transparent hover:border-stone-200 hover:bg-stone-50 hover:text-stone-900'
                        } disabled:cursor-wait disabled:opacity-60`}
                      >
                        {jumpingToTimelineBlockId === result.block.id ? <span className="spinner" /> : <TimelineJumpIcon />}
                      </button>

                      <AddToNotebookMenu
                        blockId={result.block.id}
                        notebooks={notebooks}
                        onAddToNotebook={onAddResultToNotebook}
                        onCreateNotebookWithBlock={onCreateNotebookWithResult}
                      />
                    </div>
                  )}
                />
              </div>
            )}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-sm leading-6 text-stone-500">
          {resultsEmptyHint}
        </div>
      )}
    </aside>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-lg border border-stone-200 bg-white/70 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">搜索生成</p>
        <p className="mb-3 text-xs leading-5 text-stone-500">先把问题写清楚，再决定是只看相关块，还是继续生成一篇结构化文档。</p>

        {browseTag ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">按标签浏览：{browseTag}</span>
            <button type="button" onClick={onClearBrowseTag} className="text-xs text-stone-400 transition hover:text-stone-600">清除</button>
          </div>
        ) : null}

        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSearch() }
          }}
          placeholder="描述你想找的内容，或者要生成的文档主题。"
          className="w-full resize-none rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white/80 focus:ring-1 focus:ring-stone-200"
          rows={4}
        />

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onSearch} disabled={searching || !query.trim()} className="flex-1 rounded border border-stone-200 bg-stone-50 py-2 text-sm font-medium text-stone-700 transition duration-150 hover:bg-stone-100 active:scale-[0.97] disabled:opacity-50">
            {searching ? '检索中…' : '检索'}
          </button>
          <button type="button" onClick={onGenerate} disabled={generating || !query.trim()} className="flex-1 rounded bg-stone-900 py-2 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50">
            {generating ? '生成中…' : '生成文档'}
          </button>
        </div>

        {!showDocumentPanel ? (
          <p className="mt-2 text-xs leading-5 text-stone-400">
            当前窗口较小，已自动收起生成区；放大窗口后可查看生成文档与参考块。
          </p>
        ) : null}
      </div>

      {showDocumentPanel ? (
        <div className="grid min-h-0 min-w-0 flex-1 gap-4 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:grid-rows-1 2xl:grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)]">
          {resultsPane}

          <section data-testid="search-document-panel" className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">生成文档</p>
              {document.topic ? <p className="mt-0.5 truncate text-xs text-stone-500">主题：{document.topic}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {document.status !== 'idle' ? (
                <span className="text-xs text-stone-400">
                  {document.status === 'streaming' ? '正在流式生成' : document.status === 'done' ? '生成完成' : document.status === 'error' ? '生成失败' : ''}
                </span>
              ) : null}
              {canCopyDocument ? (
                <button type="button" onClick={() => { navigator.clipboard.writeText(document.content); toast('success', '已复制到剪贴板') }} className="rounded border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition duration-150 hover:bg-stone-50 active:scale-[0.97]">复制全文</button>
              ) : null}
              {document.status === 'done' && canCopyDocument ? (
                <button type="button" onClick={onSaveSnapshot} className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700">保存快照</button>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)]">
            <div data-testid="generated-document-scroll" className="min-h-0 overflow-y-auto overflow-x-hidden rounded-lg border border-stone-200 bg-white/70 px-5 py-5">
              {document.content ? (
                <div className="min-w-0 break-words">
                  <MarkdownContent content={document.content} />
                </div>
              ) : (
                <p className="text-sm leading-7 text-stone-400">点击"生成文档"后，这里会逐段出现编排结果。</p>
              )}
              {document.error ? <p className="mt-4 text-sm text-rose-600">{document.error}</p> : null}
            </div>

            <aside className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-stone-200 bg-stone-50/70 px-4 py-4">
              <div className="shrink-0">
                <p className="text-xs font-medium uppercase tracking-wider text-stone-400">本次参考块</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">生成完成后，这里会展示本次真正进入文档生成的引用块，并可继续沉淀到 notebook。</p>
              </div>

              <div className="shrink-0 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onDepositToNewNotebook}
                  disabled={!canShowReferences || documentReferences.length === 0 || documentDepositAction !== null}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  {documentDepositAction === 'create' ? '新建中…' : '新建 notebook'}
                </button>
                <button
                  type="button"
                  onClick={onDepositToCurrentNotebook}
                  disabled={!canShowReferences || documentReferences.length === 0 || !selectedNotebook || documentDepositAction !== null}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  {documentDepositAction === 'append'
                    ? '保存中…'
                    : selectedNotebook
                      ? `加入「${selectedNotebook.title}」`
                      : '加入当前 notebook'}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {!canShowReferences ? (
                  <div className="rounded-lg border border-dashed border-stone-200 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-500">
                    当前还没有可展示的参考块。生成失败或空文档时，这里不会保留上一轮的旧引用。
                  </div>
                ) : documentReferencesLoading ? (
                  <div className="rounded-lg bg-white/80 px-4 py-4 text-sm text-stone-500">参考块加载中…</div>
                ) : documentReferences.length > 0 ? (
                  <div className="space-y-2">
                    {documentReferences.map((result) => (
                      <SearchResultCard
                        key={result.block.id}
                        result={result}
                        query={query}
                        onTagClick={onTagClick}
                        showScore={false}
                        metaLabel="本次参考"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-stone-200 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-500">
                    这次生成没有引用到已有块。你仍然可以保存快照，但暂时没有可沉淀的参考块集合。
                  </div>
                )}
              </div>
            </aside>
          </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {resultsPane}
        </div>
      )}
    </div>
  )
}

function TimelineJumpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 6.5h10A1.5 1.5 0 0 1 18.5 8v8A1.5 1.5 0 0 1 17 17.5H7A1.5 1.5 0 0 1 5.5 16V8A1.5 1.5 0 0 1 7 6.5Z" />
      <path d="M9 12h6" />
      <path d="m12 9 3 3-3 3" />
    </svg>
  )
}
