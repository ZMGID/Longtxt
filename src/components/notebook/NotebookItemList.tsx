import { useEffect, useMemo, useState } from 'react'

import type { Notebook, NotebookItem, TagSuggestion } from '../../../shared/types'
import { BlockCard } from '../BlockCard'
import { ActionButton } from '../ui/ActionButton'
import { NotebookStructureItemView } from './NotebookStructureItemView'
import { moveItemIds, reorderItemIds } from './utils'

interface NotebookItemListProps {
  selectedNotebook: Notebook
  loadingNotebook: boolean
  tagSuggestions: TagSuggestion[]
  onUpdateBlock: (id: string, content: string) => Promise<void>
  onAddTag: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag: (blockId: string, tagId: string) => Promise<void>
  onTagClick: (tagName: string) => void
  onRemoveNotebookItem: (notebookId: string, itemId: string) => Promise<void>
  onReorderNotebookItems: (notebookId: string, itemIds: string[]) => Promise<void>
  onUpdateNotebookStructureItem: (notebookId: string, itemId: string, patch: { content?: string; checked?: boolean }) => Promise<void>
}

export function NotebookItemList({
  selectedNotebook,
  loadingNotebook,
  tagSuggestions,
  onUpdateBlock,
  onAddTag,
  onRemoveTag,
  onTagClick,
  onRemoveNotebookItem,
  onReorderNotebookItems,
  onUpdateNotebookStructureItem,
}: NotebookItemListProps) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null)
  const [editingStructureItemId, setEditingStructureItemId] = useState<string | null>(null)
  const [structureDraft, setStructureDraft] = useState('')
  const [savingStructureItemId, setSavingStructureItemId] = useState<string | null>(null)
  const displayItems = useMemo(() => [...selectedNotebook.items].reverse(), [selectedNotebook.items])

  useEffect(() => {
    setDraggedItemId(null)
    setDropTargetItemId(null)
    setEditingStructureItemId(null)
    setStructureDraft('')
    setSavingStructureItemId(null)
  }, [selectedNotebook.id])

  async function handleMove(itemId: string, direction: -1 | 1): Promise<void> {
    const currentIds = displayItems.map((item) => item.id)
    const currentIndex = currentIds.indexOf(itemId)
    const nextIds = reorderItemIds(currentIds, currentIndex, currentIndex + direction)

    if (nextIds === currentIds) {
      return
    }

    await onReorderNotebookItems(selectedNotebook.id, [...nextIds].reverse())
  }

  async function handleDrop(targetItemId: string): Promise<void> {
    if (!draggedItemId) {
      return
    }

    const nextIds = moveItemIds(
      displayItems.map((item) => item.id),
      draggedItemId,
      targetItemId,
    )

    setDraggedItemId(null)
    setDropTargetItemId(null)
    await onReorderNotebookItems(selectedNotebook.id, [...nextIds].reverse())
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
    setSavingStructureItemId(itemId)

    try {
      await onUpdateNotebookStructureItem(selectedNotebook.id, itemId, { content: structureDraft })
      cancelStructureEdit()
    } finally {
      setSavingStructureItemId(null)
    }
  }

  async function toggleTodoChecked(item: Extract<NotebookItem, { type: 'todo' }>): Promise<void> {
    if (savingStructureItemId === item.id) {
      return
    }

    setSavingStructureItemId(item.id)

    try {
      await onUpdateNotebookStructureItem(selectedNotebook.id, item.id, { checked: !item.checked })
    } finally {
      setSavingStructureItemId(null)
    }
  }

  if (loadingNotebook) {
    return <div className="py-10 text-sm text-stone-400">加载笔记本内容中…</div>
  }

  if (selectedNotebook.items.length === 0) {
    return (
      <div className="py-10 text-sm leading-6 text-stone-500">
        这个笔记本还是空的。你可以先展开检索补料加入相关块，也可以直接在这里新建引用块、标题、笔记和待办。
      </div>
    )
  }

  return (
    <section data-testid="notebook-items-scroll" className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
      <div className="flex min-h-full flex-col">
        {displayItems.map((item, index) => (
          <NotebookItemRow
            key={item.id}
            item={item}
            index={index}
            totalCount={displayItems.length}
            tagSuggestions={tagSuggestions}
            isDropTarget={item.id === dropTargetItemId && draggedItemId !== item.id}
            isEditingStructureItem={editingStructureItemId === item.id}
            structureDraft={structureDraft}
            savingStructureItemId={savingStructureItemId}
            onDragStart={(itemId) => setDraggedItemId(itemId)}
            onDragEnd={() => {
              setDraggedItemId(null)
              setDropTargetItemId(null)
            }}
            onDragOver={(itemId) => {
              if (draggedItemId && draggedItemId !== itemId) {
                setDropTargetItemId(itemId)
              }
            }}
            onDrop={handleDrop}
            onMove={handleMove}
            onBeginStructureEdit={beginStructureEdit}
            onStructureDraftChange={setStructureDraft}
            onCancelStructureEdit={cancelStructureEdit}
            onSaveStructureEdit={saveStructureEdit}
            onToggleTodoChecked={toggleTodoChecked}
            onRemoveNotebookItem={(itemId) => onRemoveNotebookItem(selectedNotebook.id, itemId)}
            onUpdateBlock={onUpdateBlock}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    </section>
  )
}

interface NotebookItemRowProps {
  item: NotebookItem
  index: number
  totalCount: number
  tagSuggestions: TagSuggestion[]
  isDropTarget: boolean
  isEditingStructureItem: boolean
  structureDraft: string
  savingStructureItemId: string | null
  onDragStart: (itemId: string) => void
  onDragEnd: () => void
  onDragOver: (itemId: string) => void
  onDrop: (targetItemId: string) => void
  onMove: (itemId: string, direction: -1 | 1) => void
  onBeginStructureEdit: (item: Extract<NotebookItem, { type: 'heading' | 'note' | 'todo' }>) => void
  onStructureDraftChange: (value: string) => void
  onCancelStructureEdit: () => void
  onSaveStructureEdit: (itemId: string) => void
  onToggleTodoChecked: (item: Extract<NotebookItem, { type: 'todo' }>) => void
  onRemoveNotebookItem: (itemId: string) => Promise<void>
  onUpdateBlock: (id: string, content: string) => Promise<void>
  onAddTag: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag: (blockId: string, tagId: string) => Promise<void>
  onTagClick: (tagName: string) => void
}

function NotebookItemRow({
  item,
  index,
  totalCount,
  tagSuggestions,
  isDropTarget,
  isEditingStructureItem,
  structureDraft,
  savingStructureItemId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onBeginStructureEdit,
  onStructureDraftChange,
  onCancelStructureEdit,
  onSaveStructureEdit,
  onToggleTodoChecked,
  onRemoveNotebookItem,
  onUpdateBlock,
  onAddTag,
  onRemoveTag,
  onTagClick,
}: NotebookItemRowProps) {
  const rowClassName = [
    'grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 py-2.5 transition sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-2.5 sm:py-3',
    index > 0 ? 'border-t border-stone-200' : '',
    isDropTarget ? 'bg-stone-50/80' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      data-testid={`notebook-item-row-${item.id}`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(item.id)
      }}
      onDrop={(event) => {
        event.preventDefault()
        void onDrop(item.id)
      }}
      className={rowClassName}
    >
      <div className="flex flex-col items-center gap-0.5 pt-0.5 sm:gap-1 sm:pt-1">
        <span className="text-[10px] font-medium tabular-nums text-stone-400">{String(totalCount - index).padStart(2, '0')}</span>
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            onDragStart(item.id)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', item.id)
          }}
          onDragEnd={onDragEnd}
          aria-label="拖动排序"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 transition hover:border-stone-300 hover:text-stone-700 sm:h-6 sm:w-6"
        >
          <DragIcon />
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              void onMove(item.id, -1)
            }}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30 sm:h-5 sm:w-5"
            aria-label="上移"
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            disabled={index === totalCount - 1}
            onClick={() => {
              void onMove(item.id, 1)
            }}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30 sm:h-5 sm:w-5"
            aria-label="下移"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      <div className="min-w-0">
        {item.type === 'block' ? (
          <BlockCard
            block={item.block}
            dense
            headerActions={(
              <ActionButton
                title="移出笔记本"
                ariaLabel="移出笔记本"
                onClick={() => {
                  void onRemoveNotebookItem(item.id)
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
        ) : (
          <NotebookStructureItemView
            item={item}
            isEditing={isEditingStructureItem}
            isSaving={savingStructureItemId === item.id}
            draft={structureDraft}
            onDraftChange={onStructureDraftChange}
            onBeginEdit={onBeginStructureEdit}
            onCancelEdit={onCancelStructureEdit}
            onSave={onSaveStructureEdit}
            onRemove={(itemId) => {
              void onRemoveNotebookItem(itemId)
            }}
            onToggleTodoChecked={onToggleTodoChecked}
          />
        )}
      </div>
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
