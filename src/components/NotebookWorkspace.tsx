import { useEffect, useMemo, useRef, useState } from 'react'

import type { Notebook, NotebookSummary, SearchResult, TagSuggestion } from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { BlockCard } from './BlockCard'
import { InputBar } from './InputBar'
import { SearchResultCard } from './SearchResultCard'

interface NotebookWorkspaceProps {
  notebooks: NotebookSummary[]
  selectedNotebookId: string | null
  selectedNotebook: Notebook | null
  loading: boolean
  loadingNotebook: boolean
  searching: boolean
  searchQuery: string
  searchResults: SearchResult[]
  searchError: string | null
  error: string | null
  tagSuggestions: TagSuggestion[]
  onSelectNotebook: (id: string) => void
  onCreateNotebook: () => Promise<void>
  onUpdateNotebookTitle: (id: string, title: string) => Promise<void>
  onDeleteNotebook: (id: string) => Promise<void>
  onCreateBlockInNotebook: (notebookId: string, content: string) => Promise<void>
  onUpdateBlock: (id: string, content: string) => Promise<void>
  onAddTag: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag: (blockId: string, tagId: string) => Promise<void>
  onTagClick: (tagName: string) => void
  onRemoveNotebookItem: (notebookId: string, itemId: string) => Promise<void>
  onReorderNotebookItems: (notebookId: string, itemIds: string[]) => Promise<void>
  onSearchQueryChange: (value: string) => void
  onSearch: () => Promise<void>
  onAddSearchResultToNotebook: (blockId: string) => Promise<void>
}

function reorderItemIds(itemIds: string[], activeIndex: number, targetIndex: number): string[] {
  if (activeIndex === targetIndex || activeIndex < 0 || targetIndex < 0 || activeIndex >= itemIds.length || targetIndex >= itemIds.length) {
    return itemIds
  }

  const next = [...itemIds]
  const [moved] = next.splice(activeIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

function moveItemIds(itemIds: string[], activeId: string, targetId: string): string[] {
  return reorderItemIds(itemIds, itemIds.indexOf(activeId), itemIds.indexOf(targetId))
}

export function NotebookWorkspace({
  notebooks,
  selectedNotebookId,
  selectedNotebook,
  loading,
  loadingNotebook,
  searching,
  searchQuery,
  searchResults,
  searchError,
  error,
  tagSuggestions,
  onSelectNotebook,
  onCreateNotebook,
  onUpdateNotebookTitle,
  onDeleteNotebook,
  onCreateBlockInNotebook,
  onUpdateBlock,
  onAddTag,
  onRemoveTag,
  onTagClick,
  onRemoveNotebookItem,
  onReorderNotebookItems,
  onSearchQueryChange,
  onSearch,
  onAddSearchResultToNotebook,
}: NotebookWorkspaceProps) {
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null)
  const [isStackedLayout, setIsStackedLayout] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [addingBlockIds, setAddingBlockIds] = useState<string[]>([])
  const sidebarAutoCollapsedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const stackedBreakpoint = 1080
    const sidebarCollapseBreakpoint = 1320

    function syncViewport(): void {
      const width = window.innerWidth
      const shouldStack = width < stackedBreakpoint
      const shouldCollapseSidebar = width < sidebarCollapseBreakpoint

      setIsStackedLayout(shouldStack)
      setIsSidebarCollapsed((current) => {
        if (shouldCollapseSidebar) {
          sidebarAutoCollapsedRef.current = true
          return true
        }

        if (sidebarAutoCollapsedRef.current) {
          sidebarAutoCollapsedRef.current = false
          return false
        }

        return current
      })
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  useEffect(() => {
    setTitleDraft(selectedNotebook?.title ?? '')
    setDeleteConfirm(false)
  }, [selectedNotebook?.id, selectedNotebook?.title])

  const notebookBlockIds = useMemo(
    () => new Set(selectedNotebook?.items.filter((item) => item.type === 'block').map((item) => item.blockId) ?? []),
    [selectedNotebook?.items],
  )

  async function handleSaveTitle(): Promise<void> {
    if (!selectedNotebook || titleDraft.trim() === selectedNotebook.title) {
      return
    }

    setTitleSaving(true)

    try {
      await onUpdateNotebookTitle(selectedNotebook.id, titleDraft)
    } finally {
      setTitleSaving(false)
    }
  }

  async function handleMove(itemId: string, direction: -1 | 1): Promise<void> {
    if (!selectedNotebook) {
      return
    }

    const currentIds = selectedNotebook.items.map((item) => item.id)
    const currentIndex = currentIds.indexOf(itemId)
    const nextIds = reorderItemIds(currentIds, currentIndex, currentIndex + direction)

    if (nextIds === currentIds) {
      return
    }

    await onReorderNotebookItems(selectedNotebook.id, nextIds)
  }

  async function handleDrop(targetItemId: string): Promise<void> {
    if (!selectedNotebook || !draggedItemId) {
      return
    }

    const nextIds = moveItemIds(
      selectedNotebook.items.map((item) => item.id),
      draggedItemId,
      targetItemId,
    )

    setDraggedItemId(null)
    setDropTargetItemId(null)
    await onReorderNotebookItems(selectedNotebook.id, nextIds)
  }

  async function handleAddResult(blockId: string): Promise<void> {
    if (!selectedNotebook || addingBlockIds.includes(blockId)) {
      return
    }

    setAddingBlockIds((current) => [...current, blockId])

    try {
      await onAddSearchResultToNotebook(blockId)
    } finally {
      setAddingBlockIds((current) => current.filter((id) => id !== blockId))
    }
  }

  function handleToggleSidebar(): void {
    setIsSidebarCollapsed((current) => !current)
  }

  const sidebarButtonLabel = isSidebarCollapsed ? '展开检索栏' : '收起检索栏'
  const layoutClassName = isStackedLayout
    ? 'flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden'
    : isSidebarCollapsed
      ? 'grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(13.5rem,15.5rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]'
      : 'grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(13.5rem,15.5rem)_minmax(0,1fr)_minmax(17rem,20rem)] 2xl:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)_minmax(18rem,22rem)]'

  return (
    <div className={layoutClassName}>
      <aside
        className={isStackedLayout
          ? 'order-2 flex max-h-[16rem] min-h-[13rem] shrink-0 flex-col rounded-[28px] bg-stone-50/90 px-4 py-4'
          : 'flex min-h-0 flex-col rounded-[28px] bg-stone-50/90 px-4 py-4'}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200/80 pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-stone-400">笔记本</p>
            <h3 className="mt-2 text-lg font-semibold text-stone-900">{notebooks.length} 个笔记本</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              void onCreateNotebook()
            }}
            className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
          >
            新建
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-2xl bg-white px-4 py-5 text-sm text-stone-500">加载笔记本中…</div>
          ) : notebooks.length > 0 ? (
            <div className="space-y-1">
              {notebooks.map((notebook) => {
                const active = notebook.id === selectedNotebookId

                return (
                  <button
                    key={notebook.id}
                    type="button"
                    onClick={() => onSelectNotebook(notebook.id)}
                    className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                      active
                        ? 'bg-white text-stone-900 shadow-[0_12px_30px_rgba(28,25,23,0.08)]'
                        : 'text-stone-600 hover:bg-white/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{notebook.title}</div>
                        <div className="mt-1 text-xs text-stone-400">{notebook.blockCount} 个引用块</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-stone-400">
                        {formatTimeLabel(notebook.updatedAt)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/80 px-4 py-5 text-sm leading-6 text-stone-500">
              先创建一个笔记本，再把时间线里的块收录进来。
            </div>
          )}
        </div>
      </aside>

      <section className={isStackedLayout ? 'order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'}>
        <div className="mb-4 flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            {sidebarButtonLabel}
          </button>
        </div>
        {error ? (
          <div className="mb-4 shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {!selectedNotebook ? (
          <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-[32px] border border-dashed border-stone-200 bg-white/70 px-8 text-center">
            <div className="max-w-md">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-stone-400">Notebook</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-900">把相关引用块收进同一页，专注整理与写作</h2>
              <p className="mt-3 text-sm leading-7 text-stone-500">
                中间只保留当前笔记本的引用块，右侧只负责检索补料，避免页面目标分散。
              </p>
              <button
                type="button"
                onClick={() => {
                  void onCreateNotebook()
                }}
                className="mt-6 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                创建笔记本
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 rounded-[32px] bg-white/80 px-6 py-5 shadow-[0_24px_60px_rgba(28,25,23,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => {
                        void handleSaveTitle()
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleSaveTitle()
                        }
                      }}
                      className="w-full min-w-0 border-none bg-transparent p-0 text-3xl font-semibold text-stone-900 outline-none"
                    />
                    {titleSaving ? <span className="text-xs text-stone-400">保存中…</span> : null}
                  </div>
                  <p className="mt-3 text-sm text-stone-500">
                    {selectedNotebook.blockCount} 个引用块
                    <span className="mx-2 text-stone-300">·</span>
                    最近整理 {formatTimeLabel(selectedNotebook.updatedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (deleteConfirm) {
                        void onDeleteNotebook(selectedNotebook.id)
                      } else {
                        setDeleteConfirm(true)
                      }
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      deleteConfirm
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {deleteConfirm ? '确认删除?' : '删除笔记本'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 shrink-0">
              <InputBar
                embedded
                onSubmit={(content) => onCreateBlockInNotebook(selectedNotebook.id, content)}
                placeholder="在当前笔记本中新建引用块，适合边整理边补充。"
                submitLabel="新建引用块"
              />
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              {loadingNotebook ? (
                <div className="rounded-3xl bg-white/70 px-6 py-10 text-sm text-stone-500">加载笔记本内容中…</div>
              ) : selectedNotebook.items.length > 0 ? (
                <div className="space-y-2 pb-6">
                  {selectedNotebook.items.map((item, index) => {
                    if (item.type !== 'block') {
                      return null
                    }

                    const isDropTarget = item.id === dropTargetItemId && draggedItemId !== item.id

                    return (
                      <div
                        key={item.id}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (draggedItemId && draggedItemId !== item.id) {
                            setDropTargetItemId(item.id)
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          void handleDrop(item.id)
                        }}
                        className={`grid gap-2 rounded-[24px] px-1 py-1 transition md:grid-cols-[46px_minmax(0,1fr)] ${
                          isDropTarget ? 'bg-stone-100/80' : ''
                        }`}
                      >
                        <div className="flex flex-row items-start gap-2 md:flex-col md:items-center md:gap-1.5 md:pt-2">
                          <span className="text-[11px] font-medium tabular-nums text-stone-400">{String(index + 1).padStart(2, '0')}</span>
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setDraggedItemId(item.id)
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', item.id)
                            }}
                            onDragEnd={() => {
                              setDraggedItemId(null)
                              setDropTargetItemId(null)
                            }}
                            aria-label="拖动排序"
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 transition hover:border-stone-300 hover:text-stone-700"
                          >
                            <DragIcon />
                          </button>
                          <div className="flex items-center gap-1 md:flex-col">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                void handleMove(item.id, -1)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-white hover:text-stone-700 disabled:opacity-30"
                              aria-label="上移"
                            >
                              <ChevronUpIcon />
                            </button>
                            <button
                              type="button"
                              disabled={index === selectedNotebook.items.length - 1}
                              onClick={() => {
                                void handleMove(item.id, 1)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-white hover:text-stone-700 disabled:opacity-30"
                              aria-label="下移"
                            >
                              <ChevronDownIcon />
                            </button>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <BlockCard
                            block={item.block}
                            headerActions={(
                              <button
                                type="button"
                                title="移出笔记本"
                                aria-label="移出笔记本"
                                onClick={() => {
                                  void onRemoveNotebookItem(selectedNotebook.id, item.id)
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-stone-400 transition hover:border-stone-200 hover:bg-stone-50 hover:text-rose-600"
                              >
                                <RemoveIcon />
                              </button>
                            )}
                            tagSuggestions={tagSuggestions}
                            onSave={onUpdateBlock}
                            onAddTag={onAddTag}
                            onRemoveTag={onRemoveTag}
                            onTagClick={onTagClick}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-stone-200 bg-white/80 px-6 py-10 text-center text-sm leading-6 text-stone-500">
                  这个笔记本还是空的。你可以先从右侧检索相关块加入，也可以直接在这里新建引用块。
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {!isSidebarCollapsed ? (
        <aside
          className={isStackedLayout
            ? 'order-3 flex max-h-[20rem] min-h-[16rem] shrink-0 flex-col rounded-[28px] bg-stone-50/80 p-4'
            : 'flex min-h-0 flex-col rounded-[28px] bg-stone-50/80 p-4'}
        >
          <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-stone-200 bg-white/90 px-4 py-4">
            <div className="shrink-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-400">检索补料</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">在这里搜索相关块，确认后加入当前笔记本。</p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onSearch()
                  }
                }}
                placeholder="搜索相关块或点击标签继续收窄"
                className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  void onSearch()
                }}
                disabled={!selectedNotebook || !searchQuery.trim()}
                className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {searching ? '搜索中…' : '搜索'}
              </button>
            </div>

            {searchError ? (
              <div className="mt-4 shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</div>
            ) : null}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {!selectedNotebook ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-sm leading-6 text-stone-500">
                  先选择一个笔记本，再从这里搜索并加入相关引用块。
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-3">
                  {searchResults.map((result) => {
                    const added = notebookBlockIds.has(result.block.id)
                    const submitting = addingBlockIds.includes(result.block.id)

                    return (
                      <SearchResultCard
                        key={result.block.id}
                        result={result}
                        query={searchQuery}
                        onTagClick={onTagClick}
                        footer={(
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={added || submitting}
                              onClick={() => {
                                void handleAddResult(result.block.id)
                              }}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                added
                                  ? 'border border-stone-200 bg-stone-100 text-stone-400'
                                  : 'bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50'
                              }`}
                            >
                              {added ? '已加入当前笔记本' : submitting ? '加入中…' : '加入当前笔记本'}
                            </button>
                          </div>
                        )}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-sm leading-6 text-stone-500">
                  {searchQuery.trim()
                    ? '还没有检索结果，换个关键词试试。'
                    : '输入关键词开始检索，或从结果标签继续二次搜索。'}
                </div>
              )}
            </div>
          </section>
        </aside>
      ) : null}
    </div>
  )
}

function DragIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" d="M8 6.5h.01M8 12h.01M8 17.5h.01M16 6.5h.01M16 12h.01M16 17.5h.01" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12.5 10 7.5l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
    </svg>
  )
}
