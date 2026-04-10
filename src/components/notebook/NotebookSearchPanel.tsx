import { useState } from 'react'
import { Virtuoso } from 'react-virtuoso'

import type { Notebook, SearchResult } from '../../../shared/types'
import { SearchResultCard } from '../SearchResultCard'
import { ActionButton } from '../ui/ActionButton'
import type { NotebookPanelMode } from './utils'

interface NotebookSearchPanelProps {
  selectedNotebook: Notebook | null
  searchPanelMode: NotebookPanelMode
  searching: boolean
  searchQuery: string
  searchResults: SearchResult[]
  searchError: string | null
  notebookBlockIds: Set<string>
  onSearchQueryChange: (value: string) => void
  onSearch: () => Promise<void>
  onClose: () => void
  onTagClick: (tagName: string) => void
  onAddSearchResultToNotebook: (blockId: string) => Promise<void>
}

export function NotebookSearchPanel({
  selectedNotebook,
  searchPanelMode,
  searching,
  searchQuery,
  searchResults,
  searchError,
  notebookBlockIds,
  onSearchQueryChange,
  onSearch,
  onClose,
  onTagClick,
  onAddSearchResultToNotebook,
}: NotebookSearchPanelProps) {
  const [addingBlockIds, setAddingBlockIds] = useState<string[]>([])

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

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-stone-200 pb-3">
        <ActionButton
          onClick={onClose}
          className="w-full px-3 py-2 text-xs"
        >
          返回笔记本
        </ActionButton>
      </div>

      <div className="mt-3 flex flex-col gap-2">
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="truncate px-1 text-[11px] leading-5 text-stone-400">
            {selectedNotebook ? `在「${selectedNotebook.title}」中补充相关块` : '先选择一个笔记本'}
          </div>
          <ActionButton
            onClick={() => {
              void onSearch()
            }}
            disabled={!selectedNotebook || !searchQuery.trim()}
            active
            className="px-4 py-2 text-xs"
          >
            {searching ? '搜索中…' : '搜索'}
          </ActionButton>
        </div>
      </div>

      {searchError ? (
        <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{searchError}</div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 pr-1">
        {!selectedNotebook ? (
          <p className="text-sm leading-6 text-stone-500">先选择一个笔记本，再从这里搜索并加入相关引用块。</p>
        ) : searchResults.length > 0 ? (
          <Virtuoso
            style={{ height: searchPanelMode === 'docked' ? '100%' : 'min(60vh, 720px)' }}
            data={searchResults}
            computeItemKey={(_, result) => result.block.id}
            itemContent={(index, result) => {
              const added = notebookBlockIds.has(result.block.id)
              const submitting = addingBlockIds.includes(result.block.id)

              return (
                <div className={index === searchResults.length - 1 ? '' : 'pb-3'}>
                  <SearchResultCard
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
                </div>
              )
            }}
          />
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
}
