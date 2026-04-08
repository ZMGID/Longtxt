import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type {
  Notebook,
  NotebookItem,
  NotebookStructureItemType,
  NotebookSummary,
  SearchResult,
  TagSuggestion,
} from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { BlockCard } from './BlockCard'
import { InputBar } from './InputBar'
import { MarkdownContent } from './MarkdownContent'
import { SearchResultCard } from './SearchResultCard'
import { ActionButton } from './ui/ActionButton'
import { SectionEyebrow } from './ui/SectionEyebrow'

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
  onCreateNotebookStructureItem: (notebookId: string, type: NotebookStructureItemType) => Promise<void>
  onUpdateNotebookStructureItem: (notebookId: string, itemId: string, patch: { content?: string; checked?: boolean }) => Promise<void>
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

type NotebookLayoutMode = 'two-pane' | 'single-pane'
type NotebookPanelMode = 'docked' | 'inline' | 'collapsed'

const STRUCTURE_ITEM_ACTIONS: Array<{ type: NotebookStructureItemType; label: string }> = [
  { type: 'heading', label: '新建标题' },
  { type: 'divider', label: '新建分隔线' },
  { type: 'note', label: '新建笔记' },
  { type: 'todo', label: '新建待办' },
]

const SINGLE_PANE_BREAKPOINT = 1120
const SEARCH_DOCK_BREAKPOINT = 1480

function resolveLayoutMode(width: number): NotebookLayoutMode {
  return width < SINGLE_PANE_BREAKPOINT ? 'single-pane' : 'two-pane'
}

function shouldDockSearch(width: number): boolean {
  return width >= SEARCH_DOCK_BREAKPOINT
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

function notebookSummaryLabel(notebook: Pick<NotebookSummary, 'itemCount' | 'blockCount' | 'structureCount'>): string {
  return `${notebook.itemCount} 项 · ${notebook.blockCount} 个引用块 / ${notebook.structureCount} 个结构项`
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
  onCreateNotebookStructureItem,
  onUpdateNotebookStructureItem,
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
  const previousLayoutModeRef = useRef<NotebookLayoutMode | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<NotebookLayoutMode>(() =>
    typeof window === 'undefined' ? 'two-pane' : resolveLayoutMode(window.innerWidth),
  )
  const [searchCanDock, setSearchCanDock] = useState(() =>
    typeof window === 'undefined' ? true : shouldDockSearch(window.innerWidth),
  )
  const [notebookListOpen, setNotebookListOpen] = useState(() =>
    typeof window === 'undefined' ? true : resolveLayoutMode(window.innerWidth) === 'two-pane',
  )
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [addingBlockIds, setAddingBlockIds] = useState<string[]>([])
  const [editingStructureItemId, setEditingStructureItemId] = useState<string | null>(null)
  const [structureDraft, setStructureDraft] = useState('')
  const [savingStructureItemId, setSavingStructureItemId] = useState<string | null>(null)
  const [creatingStructureType, setCreatingStructureType] = useState<NotebookStructureItemType | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function syncViewport(): void {
      const width = window.innerWidth
      setLayoutMode(resolveLayoutMode(width))
      setSearchCanDock(shouldDockSearch(width))
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  useEffect(() => {
    const previousLayoutMode = previousLayoutModeRef.current
    previousLayoutModeRef.current = layoutMode

    if (layoutMode === 'two-pane') {
      setNotebookListOpen(true)
      return
    }

    if (previousLayoutMode === 'two-pane') {
      setNotebookListOpen(false)
      setSearchPanelOpen(false)
    }
  }, [layoutMode])

  useEffect(() => {
    setTitleDraft(selectedNotebook?.title ?? '')
    setDeleteConfirm(false)
    setEditingStructureItemId(null)
    setStructureDraft('')
  }, [selectedNotebook?.id, selectedNotebook?.title])

  const notebookBlockIds = useMemo(
    () => new Set(selectedNotebook?.items.filter((item) => item.type === 'block').map((item) => item.blockId) ?? []),
    [selectedNotebook?.items],
  )

  const searchPanelMode: NotebookPanelMode = searchPanelOpen
    ? layoutMode === 'two-pane' && searchCanDock
      ? 'docked'
      : 'inline'
    : 'collapsed'
  const notebookListMode: NotebookPanelMode = layoutMode === 'two-pane' ? 'docked' : notebookListOpen ? 'inline' : 'collapsed'

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

  async function handleCreateStructureItem(type: NotebookStructureItemType): Promise<void> {
    if (!selectedNotebook || creatingStructureType) {
      return
    }

    setCreatingStructureType(type)

    try {
      await onCreateNotebookStructureItem(selectedNotebook.id, type)
    } finally {
      setCreatingStructureType(null)
    }
  }

  function beginStructureEdit(item: Extract<NotebookItem, { type: 'heading' | 'note' | 'todo' }>): void {
    setEditingStructureItemId(item.id)
    setStructureDraft(item.content)
  }

  function cancelStructureEdit(): void {
    setEditingStructureItemId(null)
    setStructureDraft('')
  }

  async function saveStructureEdit(itemId: string): Promise<void> {
    if (!selectedNotebook) {
      return
    }

    setSavingStructureItemId(itemId)

    try {
      await onUpdateNotebookStructureItem(selectedNotebook.id, itemId, { content: structureDraft })
      cancelStructureEdit()
    } finally {
      setSavingStructureItemId(null)
    }
  }

  async function toggleTodoChecked(item: Extract<NotebookItem, { type: 'todo' }>): Promise<void> {
    if (!selectedNotebook || savingStructureItemId === item.id) {
      return
    }

    setSavingStructureItemId(item.id)

    try {
      await onUpdateNotebookStructureItem(selectedNotebook.id, item.id, { checked: !item.checked })
    } finally {
      setSavingStructureItemId(null)
    }
  }

  function handleToggleNotebookList(): void {
    if (layoutMode === 'two-pane') {
      return
    }

    setNotebookListOpen((current) => {
      const next = !current

      if (next) {
        setSearchPanelOpen(false)
      }

      return next
    })
  }

  function handleToggleSearchPanel(): void {
    setSearchPanelOpen((current) => {
      const next = !current

      if (next && layoutMode === 'single-pane') {
        setNotebookListOpen(false)
      }

      return next
    })
  }

  function renderStructureItem(
    item: Exclude<NotebookItem, { type: 'block' }>,
    notebookId: string,
  ): ReactNode {
    const isEditing = editingStructureItemId === item.id
    const isSaving = savingStructureItemId === item.id

    const removeButton = (
      <ActionButton
        title="删除结构项"
        ariaLabel="删除结构项"
        onClick={() => {
          void onRemoveNotebookItem(notebookId, item.id)
        }}
        className="px-2.5 py-1.5 text-xs"
      >
        删除
      </ActionButton>
    )

    if (item.type === 'divider') {
      return (
        <div className="py-5 first:pt-0">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">分隔线</span>
            <div className="h-px flex-1 bg-stone-200" />
            {removeButton}
          </div>
        </div>
      )
    }

    const editButton = (
      <ActionButton
        onClick={() => beginStructureEdit(item)}
        className="px-2.5 py-1.5 text-xs"
      >
        编辑
      </ActionButton>
    )

    if (item.type === 'heading') {
      return (
        <div className="py-6 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SectionEyebrow>Heading</SectionEyebrow>
              {isEditing ? (
                <div className="mt-4 space-y-3">
                  <input
                    value={structureDraft}
                    onChange={(event) => setStructureDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        cancelStructureEdit()
                      }
                    }}
                    placeholder="输入章节标题"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-lg font-semibold text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <ActionButton onClick={cancelStructureEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                    <ActionButton
                      onClick={() => {
                        void saveStructureEdit(item.id)
                      }}
                      disabled={isSaving}
                      active
                      className="px-2.5 py-1.5 text-xs"
                    >
                      {isSaving ? '保存中…' : '保存'}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <h3 className="mt-3 break-words text-2xl font-semibold text-stone-900">{item.content.trim() || '未命名标题'}</h3>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? null : editButton}
              {removeButton}
            </div>
          </div>
        </div>
      )
    }

    if (item.type === 'note') {
      return (
        <div className="py-5 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SectionEyebrow>Note</SectionEyebrow>
              {isEditing ? (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={structureDraft}
                    onChange={(event) => setStructureDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        cancelStructureEdit()
                      }
                    }}
                    rows={5}
                    placeholder="输入整理说明或写作备注"
                    className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <ActionButton onClick={cancelStructureEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                    <ActionButton
                      onClick={() => {
                        void saveStructureEdit(item.id)
                      }}
                      disabled={isSaving}
                      active
                      className="px-2.5 py-1.5 text-xs"
                    >
                      {isSaving ? '保存中…' : '保存'}
                    </ActionButton>
                  </div>
                </div>
              ) : item.content.trim() ? (
                <div className="mt-3 min-w-0 break-words text-sm leading-7 text-stone-700">
                  <MarkdownContent content={item.content} />
                </div>
              ) : (
                <p className="mt-3 text-sm leading-7 text-stone-400">这条笔记还是空的，点击“编辑”补充整理说明。</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? null : editButton}
              {removeButton}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="py-5 first:pt-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SectionEyebrow>Todo</SectionEyebrow>
            {isEditing ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={structureDraft}
                  onChange={(event) => setStructureDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      cancelStructureEdit()
                    }
                  }}
                  rows={3}
                  placeholder="输入待办内容"
                  className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <ActionButton onClick={cancelStructureEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                  <ActionButton
                    onClick={() => {
                      void saveStructureEdit(item.id)
                    }}
                    disabled={isSaving}
                    active
                    className="px-2.5 py-1.5 text-xs"
                  >
                    {isSaving ? '保存中…' : '保存'}
                  </ActionButton>
                </div>
              </div>
            ) : (
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => {
                    void toggleTodoChecked(item)
                  }}
                  className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                />
                <span className={`min-w-0 text-sm leading-7 ${item.checked ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                  {item.content.trim() || '待补充待办内容'}
                </span>
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? null : editButton}
            {removeButton}
          </div>
        </div>
      </div>
    )
  }

  const notebookListPanel = (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow>Notebook List</SectionEyebrow>
          <h3 className="mt-3 text-lg font-semibold text-stone-900">{notebooks.length} 个笔记本</h3>
          <p className="mt-2 text-sm leading-6 text-stone-500">左侧只保留切换与概览，让整理正文始终是主角。</p>
        </div>
        <ActionButton
          onClick={() => {
            void onCreateNotebook()
          }}
          active
          className="px-3 py-2 text-xs"
        >
          新建
        </ActionButton>
      </div>

      <div className="mt-5 min-h-0 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-stone-400">加载笔记本中…</p>
        ) : notebooks.length > 0 ? (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {notebooks.map((notebook) => {
              const active = notebook.id === selectedNotebookId

              return (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => onSelectNotebook(notebook.id)}
                  className={`flex w-full items-start justify-between gap-3 border-l-2 px-3 py-3 text-left transition ${
                    active
                      ? 'border-stone-900 bg-stone-50/70 text-stone-900'
                      : 'border-transparent text-stone-500 hover:border-stone-200 hover:bg-stone-50/60 hover:text-stone-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{notebook.title}</div>
                    <div className="mt-1 text-xs text-stone-400">{notebookSummaryLabel(notebook)}</div>
                  </div>
                  <div className="shrink-0 pt-0.5 text-[11px] text-stone-400">{formatTimeLabel(notebook.updatedAt)}</div>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-500">先创建一个笔记本，再把时间线里的块或结构项整理到这里。</p>
        )}
      </div>
    </section>
  )

  const searchPanel = (
    <section>
      <div>
        <SectionEyebrow>Search</SectionEyebrow>
        <h3 className="mt-3 text-lg font-semibold text-stone-900">检索补料</h3>
        <p className="mt-2 text-sm leading-6 text-stone-500">只在需要时展开，用来补充相关块，不再常驻挤压正文。</p>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
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
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-6 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
        />
        <ActionButton
          onClick={() => {
            void onSearch()
          }}
          disabled={!selectedNotebook || !searchQuery.trim()}
          active
          className="px-4 py-2.5 text-xs"
        >
          {searching ? '搜索中…' : '搜索'}
        </ActionButton>
      </div>

      {searchError ? (
        <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</div>
      ) : null}

      <div className="mt-5 min-h-0 overflow-y-auto pr-1">
        {!selectedNotebook ? (
          <p className="text-sm leading-6 text-stone-500">先选择一个笔记本，再从这里搜索并加入相关引用块。</p>
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
                      <ActionButton
                        disabled={added || submitting}
                        active={!added}
                        onClick={() => {
                          void handleAddResult(result.block.id)
                        }}
                        className={`px-3 py-1.5 text-xs ${added ? 'border-stone-200 bg-stone-100 text-stone-400 hover:bg-stone-100' : ''}`}
                      >
                        {added ? '已加入当前笔记本' : submitting ? '加入中…' : '加入当前笔记本'}
                      </ActionButton>
                    </div>
                  )}
                />
              )
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-500">
            {searchQuery.trim()
              ? '还没有检索结果，换个关键词试试。'
              : '输入关键词开始检索，或从结果标签继续二次搜索。'}
          </p>
        )}
      </div>
    </section>
  )

  const workspaceHeader = selectedNotebook ? (
    <section className="border-b border-stone-200 pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <SectionEyebrow>Notebook</SectionEyebrow>
          <div className="mt-3 flex items-center gap-3">
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
            {titleSaving ? <span className="shrink-0 text-xs text-stone-400">保存中…</span> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            {selectedNotebook.itemCount} 项内容
            <span className="mx-2 text-stone-300">·</span>
            {selectedNotebook.blockCount} 个引用块
            <span className="mx-2 text-stone-300">·</span>
            {selectedNotebook.structureCount} 个结构项
            <span className="mx-2 text-stone-300">·</span>
            最近整理 {formatTimeLabel(selectedNotebook.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {layoutMode === 'two-pane' ? (
            <ActionButton
              onClick={handleToggleSearchPanel}
              testId="notebook-search-toggle"
              className="px-3 py-2 text-xs"
            >
              {searchPanelOpen ? '收起检索栏' : '展开检索栏'}
            </ActionButton>
          ) : null}
          <ActionButton
            danger={deleteConfirm}
            onClick={() => {
              if (deleteConfirm) {
                void onDeleteNotebook(selectedNotebook.id)
              } else {
                setDeleteConfirm(true)
              }
            }}
          >
            {deleteConfirm ? '确认删除?' : '删除笔记本'}
          </ActionButton>
        </div>
      </div>
    </section>
  ) : null

  const workspaceComposer = selectedNotebook ? (
    <section className="border-b border-stone-200 py-6">
      <div>
        <SectionEyebrow>Compose</SectionEyebrow>
        <p className="mt-3 text-sm leading-6 text-stone-500">围绕当前笔记本补块、补标题、补注释，保持整理流连续。</p>
      </div>
      <div className="mt-5">
        <InputBar
          embedded
          onSubmit={(content) => onCreateBlockInNotebook(selectedNotebook.id, content)}
          placeholder="在当前笔记本中新建引用块，适合边整理边补充。"
          submitLabel="新建引用块"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {STRUCTURE_ITEM_ACTIONS.map((action) => (
          <ActionButton
            key={action.type}
            disabled={creatingStructureType !== null}
            onClick={() => {
              void handleCreateStructureItem(action.type)
            }}
            className="px-3 py-2 text-xs"
          >
            {creatingStructureType === action.type ? `${action.label}中…` : action.label}
          </ActionButton>
        ))}
      </div>
    </section>
  ) : null

  const workspaceBody = !selectedNotebook ? (
    <section className="py-10">
      <SectionEyebrow>Notebook</SectionEyebrow>
      <h2 className="mt-3 max-w-2xl text-2xl font-semibold text-stone-900">把引用块和结构化整理放进同一条内容流，专注沉淀与写作。</h2>
      <p className="mt-3 max-w-xl text-sm leading-7 text-stone-500">
        当前页面只保留整理本身：选择笔记本、补充引用块、插入结构项，再按需要展开检索补料。
      </p>
      <ActionButton
        onClick={() => {
          void onCreateNotebook()
        }}
        active
        className="mt-6 px-4 py-2.5"
      >
        创建笔记本
      </ActionButton>
    </section>
  ) : (
    <section className="min-h-0 flex-1 overflow-y-auto pr-1">
      {loadingNotebook ? (
        <div className="py-10 text-sm text-stone-400">加载笔记本内容中…</div>
      ) : selectedNotebook.items.length > 0 ? (
        <div className="divide-y divide-stone-200 pb-6">
          {selectedNotebook.items.map((item, index) => {
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
                className={`grid gap-4 py-5 transition md:grid-cols-[46px_minmax(0,1fr)] ${isDropTarget ? 'bg-stone-50/80' : ''}`}
              >
                <div className="flex flex-row items-start gap-2 md:flex-col md:items-center md:gap-1.5 md:pt-1">
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
                      className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30"
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
                      className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30"
                      aria-label="下移"
                    >
                      <ChevronDownIcon />
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  {item.type === 'block'
                    ? (
                        <BlockCard
                          block={item.block}
                          headerActions={(
                            <ActionButton
                              title="移出笔记本"
                              ariaLabel="移出笔记本"
                              onClick={() => {
                                void onRemoveNotebookItem(selectedNotebook.id, item.id)
                              }}
                              className="px-2.5 py-1.5 text-xs"
                            >
                              删除
                            </ActionButton>
                          )}
                          tagSuggestions={tagSuggestions}
                          onSave={onUpdateBlock}
                          onAddTag={onAddTag}
                          onRemoveTag={onRemoveTag}
                          onTagClick={onTagClick}
                        />
                      )
                    : renderStructureItem(item, selectedNotebook.id)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-10 text-sm leading-6 text-stone-500">
          这个笔记本还是空的。你可以先展开检索补料加入相关块，也可以直接在这里新建引用块、标题、笔记和待办。
        </div>
      )}
    </section>
  )

  const workspaceMain = (
    <section className="min-h-0 min-w-0 flex-1">
      {layoutMode === 'single-pane' ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div>
            <SectionEyebrow>Workspace</SectionEyebrow>
            <p className="mt-2 text-sm leading-6 text-stone-500">小窗口下优先保留正文，笔记本列表和检索补料按需展开。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={handleToggleNotebookList}
              testId="notebook-list-toggle"
              className="px-3 py-2 text-xs"
            >
              {notebookListOpen ? '收起笔记本' : '展开笔记本'}
            </ActionButton>
            <ActionButton
              onClick={handleToggleSearchPanel}
              testId="notebook-search-toggle"
              className="px-3 py-2 text-xs"
            >
              {searchPanelOpen ? '收起检索栏' : '展开检索栏'}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {layoutMode === 'single-pane' && notebookListOpen ? (
        <aside data-testid="notebook-list-panel" className="mb-6 border-b border-stone-200 pb-6">
          {notebookListPanel}
        </aside>
      ) : null}

      {error ? (
        <div className="mb-6 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {searchPanelMode === 'inline' ? (
        <aside data-testid="notebook-search-panel" className="mb-6 border-b border-stone-200 pb-6">
          {searchPanel}
        </aside>
      ) : null}

      {searchPanelMode === 'docked' ? (
        <div className="grid min-h-0 min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            {workspaceHeader}
            {workspaceComposer}
            {workspaceBody}
          </div>
          <aside data-testid="notebook-search-panel" className="min-w-0 border-l border-stone-200 pl-6">
            {searchPanel}
          </aside>
        </div>
      ) : (
        <div className="min-w-0">
          {workspaceHeader}
          {workspaceComposer}
          {workspaceBody}
        </div>
      )}
    </section>
  )

  return (
    <div
      data-testid="notebook-layout"
      data-layout={layoutMode}
      data-list-mode={notebookListMode}
      data-search-mode={searchPanelMode}
      className={layoutMode === 'two-pane'
        ? 'grid min-h-0 min-w-0 flex-1 gap-10 overflow-hidden xl:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)]'
        : 'min-h-0 min-w-0 flex-1'}
    >
      {layoutMode === 'two-pane' ? (
        <aside data-testid="notebook-list-panel" className="min-h-0 min-w-0 border-r border-stone-200 pr-6">
          {notebookListPanel}
        </aside>
      ) : null}

      {workspaceMain}
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
