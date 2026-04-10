import { useEffect, useMemo, useState } from 'react'

import type {
  Notebook,
  NotebookSummary,
  NotebookStructureItemInput,
  SearchResult,
  TagSuggestion,
} from '../../shared/types'
import { ActionButton } from './ui/ActionButton'
import { SectionEyebrow } from './ui/SectionEyebrow'
import { NotebookComposer } from './notebook/NotebookComposer'
import { NotebookHeader } from './notebook/NotebookHeader'
import { NotebookItemList } from './notebook/NotebookItemList'
import { NotebookListPanel } from './notebook/NotebookListPanel'
import { NotebookSearchPanel } from './notebook/NotebookSearchPanel'
import type { NotebookLayoutMode, NotebookPanelMode } from './notebook/utils'
import { resolveLayoutMode } from './notebook/utils'

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
  onCreateNotebookStructureItem: (notebookId: string, input: NotebookStructureItemInput) => Promise<void>
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
  const [layoutState, setLayoutState] = useState<{
    layoutMode: NotebookLayoutMode
    searchPanelOpen: boolean
    mobilePanelOpen: boolean
  }>(() => {
    const width = typeof window === 'undefined' ? null : window.innerWidth
    const layoutMode = width === null ? 'two-pane' : resolveLayoutMode(width)

    return {
      layoutMode,
      searchPanelOpen: false,
      mobilePanelOpen: false,
    }
  })
  const { layoutMode, searchPanelOpen, mobilePanelOpen } = layoutState

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function syncViewport(): void {
      const width = window.innerWidth
      const nextLayoutMode = resolveLayoutMode(width)

      setLayoutState((current) => {
        let nextSearchPanelOpen = current.searchPanelOpen

        if (nextLayoutMode !== 'two-pane' && current.layoutMode === 'two-pane') {
          nextSearchPanelOpen = false
        }

        if (
          current.layoutMode === nextLayoutMode
          && current.searchPanelOpen === nextSearchPanelOpen
        ) {
          return current
        }

        return {
          layoutMode: nextLayoutMode,
          searchPanelOpen: nextSearchPanelOpen,
          mobilePanelOpen: false,
        }
      })
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  const notebookBlockIds = useMemo(
    () => new Set(selectedNotebook?.items.filter((item) => item.type === 'block').map((item) => item.blockId) ?? []),
    [selectedNotebook?.items],
  )

  const searchPanelMode: NotebookPanelMode = (
    (layoutMode === 'two-pane' && searchPanelOpen)
    || (layoutMode === 'single-pane' && mobilePanelOpen && searchPanelOpen)
  )
    ? 'docked'
    : 'collapsed'
  const notebookListMode: NotebookPanelMode = (
    (layoutMode === 'two-pane' && !searchPanelOpen)
    || (layoutMode === 'single-pane' && mobilePanelOpen && !searchPanelOpen)
  )
    ? 'docked'
    : 'collapsed'

  function handleToggleSearchPanel(): void {
    setLayoutState((current) => {
      if (current.layoutMode === 'single-pane') {
        const nextSearchPanelOpen = !current.searchPanelOpen
        return {
          ...current,
          searchPanelOpen: nextSearchPanelOpen,
          mobilePanelOpen: nextSearchPanelOpen,
        }
      }

      return {
        ...current,
        searchPanelOpen: !current.searchPanelOpen,
      }
    })
  }

  function handleOpenMobileList(): void {
    setLayoutState((current) => ({
      ...current,
      searchPanelOpen: false,
      mobilePanelOpen: !(current.mobilePanelOpen && !current.searchPanelOpen),
    }))
  }

  function handleOpenMobileSearch(): void {
    setLayoutState((current) => ({
      ...current,
      searchPanelOpen: true,
      mobilePanelOpen: !(current.mobilePanelOpen && current.searchPanelOpen),
    }))
  }

  function handleCloseMobilePanel(): void {
    setLayoutState((current) => ({
      ...current,
      mobilePanelOpen: false,
      searchPanelOpen: false,
    }))
  }

  function handleCloseSearchPanel(): void {
    setLayoutState((current) => {
      if (current.layoutMode === 'single-pane') {
        return {
          ...current,
          searchPanelOpen: false,
          mobilePanelOpen: true,
        }
      }

      return {
        ...current,
        searchPanelOpen: false,
      }
    })
  }

  function handleSelectNotebook(id: string): void {
    onSelectNotebook(id)

    if (layoutMode === 'single-pane') {
      handleCloseMobilePanel()
    }
  }

  const notebookListPanel = (
    <NotebookListPanel
      key={selectedNotebookId ?? 'notebook-list-empty'}
      notebooks={notebooks}
      selectedNotebookId={selectedNotebookId}
      selectedNotebook={selectedNotebook}
      loading={loading}
      searchPanelOpen={searchPanelOpen}
      onSelectNotebook={handleSelectNotebook}
      onCreateNotebook={onCreateNotebook}
      onDeleteNotebook={onDeleteNotebook}
      onToggleSearchPanel={handleToggleSearchPanel}
    />
  )

  const searchPanel = (
    <NotebookSearchPanel
      selectedNotebook={selectedNotebook}
      searchPanelMode={searchPanelMode}
      searching={searching}
      searchQuery={searchQuery}
      searchResults={searchResults}
      searchError={searchError}
      notebookBlockIds={notebookBlockIds}
      onSearchQueryChange={onSearchQueryChange}
      onSearch={onSearch}
      onClose={handleCloseSearchPanel}
      onTagClick={onTagClick}
      onAddSearchResultToNotebook={onAddSearchResultToNotebook}
    />
  )

  const emptyState = (
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
  )

  const notebookBody = selectedNotebook ? (
    <>
      <NotebookHeader
        selectedNotebook={selectedNotebook}
        onUpdateNotebookTitle={onUpdateNotebookTitle}
        showDeleteButton={layoutMode === 'single-pane'}
        onDeleteNotebook={onDeleteNotebook}
      />
      <NotebookComposer
        notebookId={selectedNotebook.id}
        onCreateBlockInNotebook={onCreateBlockInNotebook}
        onCreateNotebookStructureItem={onCreateNotebookStructureItem}
      />
      <NotebookItemList
        selectedNotebook={selectedNotebook}
        loadingNotebook={loadingNotebook}
        tagSuggestions={tagSuggestions}
        onUpdateBlock={onUpdateBlock}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onTagClick={onTagClick}
        onRemoveNotebookItem={onRemoveNotebookItem}
        onReorderNotebookItems={onReorderNotebookItems}
        onUpdateNotebookStructureItem={onUpdateNotebookStructureItem}
      />
    </>
  ) : emptyState

  return (
    <div
      data-testid="notebook-layout"
      data-layout={layoutMode}
      data-list-mode={notebookListMode}
      data-search-mode={searchPanelMode}
      className={layoutMode === 'two-pane'
        ? 'grid h-full min-h-0 min-w-0 flex-1 overflow-hidden grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)] gap-5'
        : 'h-full min-h-0 min-w-0 flex-1 overflow-hidden'}
    >
      {layoutMode === 'two-pane' ? (
        <aside
          data-testid={searchPanelOpen ? 'notebook-search-panel' : 'notebook-list-panel'}
          className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-stone-200 pr-3"
        >
          {searchPanelOpen ? searchPanel : notebookListPanel}
        </aside>
      ) : null}

      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {layoutMode === 'single-pane' ? (
          <div data-testid="notebook-mobile-toolbar" className="mb-2 flex shrink-0 items-center gap-2 border-b border-stone-200 pb-2">
            <ActionButton
              onClick={handleOpenMobileList}
              active={mobilePanelOpen && !searchPanelOpen}
              className="px-3 py-2 text-xs"
            >
              笔记本
            </ActionButton>
            <ActionButton
              onClick={handleOpenMobileSearch}
              active={mobilePanelOpen && searchPanelOpen}
              className="px-3 py-2 text-xs"
            >
              检索
            </ActionButton>
          </div>
        ) : null}

        {error ? (
          <div className="mb-2 shrink-0 border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {notebookBody}
        </div>

        {layoutMode === 'single-pane' && mobilePanelOpen ? (
          <div data-testid="notebook-mobile-panel" className="absolute inset-x-0 bottom-0 top-[3.25rem] z-20 min-h-0">
            <button
              type="button"
              aria-label="关闭面板"
              onClick={handleCloseMobilePanel}
              className="absolute inset-0 bg-stone-950/10 backdrop-blur-[1px]"
            />
            <aside
              data-testid={searchPanelOpen ? 'notebook-search-panel' : 'notebook-list-panel'}
              className="absolute inset-y-0 left-0 flex w-[min(22rem,calc(100%-1rem))] min-w-0 flex-col overflow-hidden border-r border-stone-200 bg-[#faf9f7] p-3 shadow-[0_12px_40px_rgba(28,25,23,0.12)]"
            >
              {searchPanelOpen ? searchPanel : notebookListPanel}
            </aside>
          </div>
        ) : null}
      </section>
    </div>
  )
}
