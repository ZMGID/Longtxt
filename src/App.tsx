import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type {
  AIExecutionMode,
  AppMeta,
  Block,
  DocGenerationChunk,
  ImportConflictStrategy,
  ImportPreview,
  RelatedBlockResult,
  SearchResult,
} from '../shared/types'
import { AppSidebar, type AppView } from './components/AppSidebar'
import { BlockCard } from './components/BlockCard'
import { CalendarView } from './components/CalendarView'
import { ChangbuEventBridge } from './components/ChangbuEventBridge'
import { DataManagementView } from './components/DataManagementView'
import { GraphView } from './components/GraphView'
import { InputBar } from './components/InputBar'
import { NotebookWorkspace } from './components/NotebookWorkspace'
import { SearchPanel } from './components/SearchPanel'
import { SnapshotsView } from './components/SnapshotsView'
import { TimelineWorkspace } from './components/TimelineWorkspace'
import { ToastProvider } from './components/Toast'
import { useToast } from './components/toast-context'
import { useAppMeta } from './hooks/useAppMeta'
import { useAppShellSettings } from './hooks/useAppShellSettings'
import { useBlocks } from './hooks/useBlocks'
import { fetchBlockCleanupDays } from './hooks/useBlockCleanupDays'
import { useGraphData } from './hooks/useGraphData'
import { useNotebooks } from './hooks/useNotebooks'
import { useSnapshots } from './hooks/useSnapshots'
import { useTags } from './hooks/useTags'
import { changbu } from './lib/changbu'
import { loadDocumentReferences } from './lib/documentReferences'
import { resolveSelectedGraphBlock } from './lib/graphSelection'
import { queryKeys } from './lib/queryKeys'

function formatTodayDateKey(): string {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

interface DocumentState {
  status: 'idle' | 'streaming' | 'done' | 'error'
  requestId: string | null
  topic: string
  content: string
  blockIds: string[]
  mode: AIExecutionMode
  error: string | null
}

const initialDocumentState: DocumentState = {
  status: 'idle',
  requestId: null,
  topic: '',
  content: '',
  blockIds: [],
  mode: 'mock',
  error: null,
}

async function runSearchAction(
  action: () => Promise<SearchResult[]>,
  handlers: {
    onStart: () => void
    onSuccess: (results: SearchResult[]) => void
    onError: (message: string) => void
    onFinally?: () => void
  },
): Promise<void> {
  handlers.onStart()

  try {
    handlers.onSuccess(await action())
  } catch (reason) {
    handlers.onError(reason instanceof Error ? reason.message : '搜索失败。')
  } finally {
    handlers.onFinally?.()
  }
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { blocks, loading, loadingMore, hasMore, error, createBlock, updateBlock, removeBlock, addTag, removeTag, loadMore, ensureBlockLoaded } = useBlocks()
  const { tags } = useTags()
  const {
    notebooks,
    selectedNotebookId,
    selectedNotebook,
    loading: notebooksLoading,
    loadingNotebook,
    error: notebooksError,
    selectNotebook,
    createNotebook,
    updateNotebook,
    removeNotebook,
    addBlockToNotebook,
    createNotebookWithBlock,
    removeNotebookItem,
    reorderItems,
    createBlockInNotebook,
    createNotebookStructureItem,
    updateNotebookStructureItem,
  } = useNotebooks()
  const [activeView, setActiveView] = useState<AppView>('timeline')
  const [searchQuery, setSearchQuery] = useState('')
  const [browseTag, setBrowseTag] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [notebookSearching, setNotebookSearching] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [notebookResults, setNotebookResults] = useState<SearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [document, setDocument] = useState<DocumentState>(initialDocumentState)
  const [documentReferences, setDocumentReferences] = useState<SearchResult[]>([])
  const [documentReferencesLoading, setDocumentReferencesLoading] = useState(false)
  const [documentDepositAction, setDocumentDepositAction] = useState<'create' | 'append' | null>(null)
  const [isWaitingToQuit, setIsWaitingToQuit] = useState(false)
  const { calendarSettings, uiSettings } = useAppShellSettings()
  const searchInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [graphTagFilters, setGraphTagFilters] = useState<string[]>([])
  const [selectedGraphBlockId, setSelectedGraphBlockId] = useState<string | null>(null)
  const [selectedGraphBlockFallback, setSelectedGraphBlockFallback] = useState<Block | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [calendarSelectedDateOverride, setCalendarSelectedDateOverride] = useState<string | null>(null)
  const [snapshotQuery, setSnapshotQuery] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [relatedBlocks, setRelatedBlocks] = useState<RelatedBlockResult[] | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const graphSelectionRequestRef = useRef<string | null>(null)
  const documentReferencesRequestIdRef = useRef<string | null>(null)
  const metaQuery = useAppMeta()
  const meta = metaQuery.data ?? null
  const graphQuery = useGraphData(graphTagFilters, activeView === 'graph')
  const graphData = graphQuery.data ?? { nodes: [], edges: [] }
  const graphLoading = graphQuery.isPending && graphData.nodes.length === 0 && graphData.edges.length === 0
  const snapshotsQuery = useSnapshots(snapshotQuery, null, activeView === 'snapshots')
  const snapshots = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data])

  const refreshMeta = useCallback(async (): Promise<AppMeta> => {
    await queryClient.refetchQueries({ queryKey: queryKeys.meta(), exact: true })
    const result = queryClient.getQueryData<AppMeta>(queryKeys.meta())

    if (!result) {
      throw new Error('刷新应用状态失败。')
    }

    return result
  }, [queryClient])

  const prefetchViewResources = useCallback((view: AppView): void => {
    const currentYear = new Date().getFullYear()
    const today = formatTodayDateKey()

    switch (view) {
      case 'calendar':
        void Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: queryKeys.calendarYears(),
            queryFn: () => changbu.calendar.listYears(),
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.calendarHeatmap(currentYear),
            queryFn: () => changbu.calendar.getYearHeatmap(currentYear),
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.calendarDay(today),
            queryFn: () => changbu.calendar.getDayDetail(today),
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.calendarUpcoming(calendarSettings.upcomingDays),
            queryFn: () => changbu.calendar.listUpcoming(calendarSettings.upcomingDays),
          }),
        ])
        return
      case 'search':
        return
      case 'notebooks':
        return
      case 'graph':
        void queryClient.prefetchQuery({
          queryKey: queryKeys.graph(graphTagFilters),
          queryFn: () => changbu.graph.getData(graphTagFilters),
        })
        return
      case 'snapshots':
        void queryClient.prefetchQuery({
          queryKey: queryKeys.snapshots('', null),
          queryFn: () => changbu.snapshots.list('', null),
        })
        return
      case 'data-management':
        void Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: queryKeys.dataManagement(),
            queryFn: () => changbu.data.getOverview(),
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.blockCleanupDays(),
            queryFn: fetchBlockCleanupDays,
          }),
        ])
        return
      case 'timeline':
        return
    }
  }, [calendarSettings.upcomingDays, graphTagFilters, queryClient])

  useEffect(() => {
    const warmViews: AppView[] = ['calendar', 'search', 'snapshots', 'data-management', 'graph']
    const timeoutId = setTimeout(() => {
      warmViews.forEach((view) => {
        prefetchViewResources(view)
      })
    }, 40)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [prefetchViewResources])

  useEffect(() => {
    let active = true

    const unsubscribe = changbu.events.onDocGenerationChunk((chunk) => {
      if (!active) {
        return
      }

      let touchedSearch = false

      startTransition(() => {
        setDocument((current) => {
          if (current.requestId !== chunk.requestId) {
            return current
          }

          touchedSearch = true
          return applyDocChunk(current, chunk)
        })
      })

      if (chunk.done && touchedSearch) {
        setGenerating(false)
        void refreshMeta()
      }
    })
    const unsubscribeQuitState = changbu.events.onQuitStateChanged((state) => {
      if (!active) {
        return
      }

      setIsWaitingToQuit(state.waiting)
    })

    return () => {
      active = false
      unsubscribe()
      unsubscribeQuitState()
    }
  }, [refreshMeta])

  useEffect(() => {
    if (!snapshotsQuery.isSuccess) {
      return
    }

    setSelectedSnapshotId((currentId) => {
      if (snapshots.length === 0) {
        return null
      }

      return currentId && snapshots.some((snapshot) => snapshot.id === currentId) ? currentId : snapshots[0].id
    })
  }, [snapshots, snapshotsQuery.isSuccess])

  useEffect(() => {
    if (activeView !== 'search') {
      return
    }

    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [activeView])

  useEffect(() => {
    if (!selectedGraphBlockId) {
      graphSelectionRequestRef.current = null
      setSelectedGraphBlockFallback(null)
      return
    }

    const loadedBlock = blocks.find((block) => block.id === selectedGraphBlockId)

    if (loadedBlock) {
      setSelectedGraphBlockFallback(loadedBlock)
    }
  }, [blocks, selectedGraphBlockId])

  useEffect(() => {
    if (activeView !== 'graph' || !selectedGraphBlockId) {
      return
    }

    if (!graphData.nodes.some((node) => node.id === selectedGraphBlockId)) {
      graphSelectionRequestRef.current = null
      setSelectedGraphBlockId(null)
      setSelectedGraphBlockFallback(null)
    }
  }, [activeView, graphData.nodes, selectedGraphBlockId])

  async function refreshDocumentReferences(requestId: string, blockIds: string[]): Promise<void> {
    documentReferencesRequestIdRef.current = requestId

    if (blockIds.length === 0) {
      setDocumentReferences([])
      setDocumentReferencesLoading(false)
      return
    }

    setDocumentReferencesLoading(true)

    try {
      const references = await loadDocumentReferences(changbu.blocks.get, blockIds)

      if (documentReferencesRequestIdRef.current !== requestId) {
        return
      }

      setDocumentReferences(references)
    } catch {
      if (documentReferencesRequestIdRef.current !== requestId) {
        return
      }

      setDocumentReferences([])
    } finally {
      if (documentReferencesRequestIdRef.current === requestId) {
        setDocumentReferencesLoading(false)
      }
    }
  }

  async function handleSearch(): Promise<void> {
    const query = searchQuery.trim()

    if (!query) {
      return
    }

    await runSearchAction(
      () => changbu.search.blocks(query, 20),
      {
        onStart: () => {
          setHasSearched(true)
          setSearching(true)
          setSearchError(null)
          setBrowseTag(null)
        },
        onSuccess: (nextResults) => {
          startTransition(() => {
            setResults(nextResults)
          })
        },
        onError: (message) => {
          setSearchError(message)
        },
        onFinally: () => {
          setSearching(false)
          void refreshMeta()
        },
      },
    )
  }

  async function handleBrowseTag(tagName: string): Promise<void> {
    await runSearchAction(
      () => changbu.search.byTag(tagName, 50),
      {
        onStart: () => {
          setActiveView('search')
          setHasSearched(true)
          setBrowseTag(tagName)
          setSearchQuery(tagName)
          setSearchError(null)
          setSearching(true)
        },
        onSuccess: (nextResults) => {
          setResults(nextResults)
        },
        onError: (message) => {
          setSearchError(message === '搜索失败。' ? '按标签浏览失败。' : message)
        },
        onFinally: () => {
          setSearching(false)
        },
      },
    )
  }

  async function handleNotebookSearch(query = searchQuery): Promise<void> {
    const nextQuery = query.trim()

    if (!nextQuery) {
      setNotebookResults([])
      return
    }

    await runSearchAction(
      () => changbu.search.blocks(nextQuery, 20),
      {
        onStart: () => {
          setNotebookSearching(true)
          setSearchError(null)
        },
        onSuccess: (nextResults) => {
          setNotebookResults(nextResults)
        },
        onError: (message) => {
          setSearchError(message)
        },
        onFinally: () => {
          setNotebookSearching(false)
        },
      },
    )
  }

  async function handleNotebookBrowseTag(tagName: string): Promise<void> {
    await runSearchAction(
      () => changbu.search.byTag(tagName, 50),
      {
        onStart: () => {
          setSearchQuery(tagName)
          setNotebookSearching(true)
          setSearchError(null)
        },
        onSuccess: (nextResults) => {
          setNotebookResults(nextResults)
        },
        onError: (message) => {
          setSearchError(message === '搜索失败。' ? '按标签浏览失败。' : message)
        },
        onFinally: () => {
          setNotebookSearching(false)
        },
      },
    )
  }

  async function handleGenerate(): Promise<void> {
    const topic = searchQuery.trim()

    if (!topic) {
      return
    }

    setGenerating(true)
    setSearchError(null)
    documentReferencesRequestIdRef.current = null
    setDocumentReferences([])
    setDocumentReferencesLoading(false)
    setDocumentDepositAction(null)
    setDocument({
      status: 'streaming',
      requestId: null,
      topic,
      content: '',
      blockIds: [],
      mode: meta?.activeAiMode ?? 'mock',
      error: null,
    })

    try {
      const started = await changbu.search.generate(topic)
      setDocument({
        status: 'streaming',
        requestId: started.requestId,
        topic: started.topic,
        content: '',
        blockIds: started.blockIds,
        mode: started.mode,
        error: null,
      })
      void refreshDocumentReferences(started.requestId, started.blockIds)
    } catch (reason) {
      setGenerating(false)
      setDocument({
        status: 'error',
        requestId: null,
        topic,
        content: '',
        blockIds: [],
        mode: meta?.activeAiMode ?? 'mock',
        error: reason instanceof Error ? reason.message : '文档生成失败。',
      })
      void refreshMeta()
    }
  }


  async function handlePreviewJsonImport(): Promise<void> {
    try {
      const preview = await changbu.imports.previewJson()

      if (!preview) {
        setImportPreview(null)
        toast('info', '已取消 JSON 导入。')
        return
      }

      setImportPreview(preview)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : 'JSON 导入预览失败。')
    }
  }

  async function handleConfirmImport(strategy: ImportConflictStrategy): Promise<void> {
    if (!importPreview) {
      return
    }

    try {
      const result = await changbu.imports.confirm(importPreview.importId, strategy)
      setImportPreview(null)
      toast('success', `导入完成，共导入 ${result.imported} 个块。`)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : '导入失败。')
    }
  }

  async function handleSaveSnapshot(): Promise<void> {
    if (!document.content.trim()) {
      return
    }

    const snapshot = await changbu.snapshots.save(document.topic, document.content, document.blockIds)
    await queryClient.invalidateQueries({ queryKey: queryKeys.snapshotsRoot() })
    setSelectedSnapshotId(snapshot.id)
    setDocumentDepositAction(null)
    setActiveView('snapshots')
    toast('success', '文档快照已保存。')
  }

  async function handleDepositDocumentToNewNotebook(): Promise<void> {
    if (!document.content.trim() || document.blockIds.length === 0 || documentDepositAction) {
      return
    }

    setDocumentDepositAction('create')

    try {
      const notebookTitle = document.topic.trim() || `新笔记本 ${notebooks.length + 1}`
      const notebook = await createNotebook(notebookTitle)

      for (const blockId of document.blockIds) {
        await addBlockToNotebook(notebook.id, blockId)
      }

      toast('success', `已新建「${notebook.title}」并收录本次参考块。`)
      setActiveView('notebooks')
    } finally {
      setDocumentDepositAction(null)
    }
  }

  async function handleDepositDocumentToCurrentNotebook(): Promise<void> {
    if (!selectedNotebook || !document.content.trim() || document.blockIds.length === 0 || documentDepositAction) {
      return
    }

    setDocumentDepositAction('append')

    try {
      for (const blockId of document.blockIds) {
        await addBlockToNotebook(selectedNotebook.id, blockId)
      }

      toast('success', `本次参考块已加入「${selectedNotebook.title}」。`)
      setActiveView('notebooks')
    } finally {
      setDocumentDepositAction(null)
    }
  }

  async function handleAddBlockToNotebook(notebookId: string, blockId: string): Promise<void> {
    const result = await addBlockToNotebook(notebookId, blockId)
    toast(result.added ? 'success' : 'info', result.added ? `已收录到「${result.notebook.title}」` : `「${result.notebook.title}」里已经有这个块`)
  }

  async function handleCreateNotebookWithBlock(blockId: string): Promise<void> {
    const notebookTitle = `新笔记本 ${notebooks.length + 1}`
    const result = await createNotebookWithBlock(blockId, notebookTitle)
    toast('success', `已新建「${result.notebook.title}」并收录当前块`)
    setActiveView('notebooks')
  }

  async function handleCreateNotebook(): Promise<void> {
    const notebook = await createNotebook(`新笔记本 ${notebooks.length + 1}`)
    toast('success', `已创建「${notebook.title}」`)
    setActiveView('notebooks')
  }

  async function handleFindRelated(blockId: string): Promise<void> {
    setRelatedLoading(true)
    try {
      const results = await changbu.blocks.findRelated(blockId)
      setRelatedBlocks(results)
    } catch {
      toast('error', '查找相关块失败。')
    } finally {
      setRelatedLoading(false)
    }
  }

  const selectedGraphBlock = resolveSelectedGraphBlock(blocks, selectedGraphBlockId, selectedGraphBlockFallback)
  const recentResults: SearchResult[] = blocks.slice(0, 5).map((block) => ({
    block,
    score: 0,
    matchSource: [],
  }))
  const showRecentResults = !hasSearched && !browseTag
  const displayedSearchResults = showRecentResults ? recentResults : results
  const searchResultsTitle = showRecentResults
    ? recentResults.length > 0
      ? `最近更新 · ${recentResults.length} 个块`
      : '最近更新'
    : browseTag
      ? `标签“${browseTag}” · ${results.length} 条结果`
      : `${results.length} 条检索结果`
  const searchResultsEmptyHint = showRecentResults
    ? loading
      ? '正在加载最近的块…'
      : '还没有块，先在时间轴记录一些内容。'
    : browseTag
      ? '这个标签下还没有相关块。'
      : '没有找到相关块，换个关键词试试。'

  const aiStatusLabel = !meta?.aiConfigured
    ? '未配置 API，当前使用 mock'
    : meta.activeAiMode === 'live'
      ? meta.lastAiError
        ? '已启用 live AI，但最近运行失败'
        : '已启用 live AI'
      : '已配置 API，但尚未通过测试'

  const activeViewTitle = {
    timeline: '时间轴',
    calendar: '日历',
    search: '搜索生成',
    notebooks: '笔记本',
    graph: '连接图',
    snapshots: '文档快照',
    'data-management': '数据管理',
  }[activeView]

  function renderActiveView(): React.ReactNode {
    switch (activeView) {
      case 'timeline':
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {error ? (
              <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            <TimelineWorkspace
              blocks={blocks}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              showMiniTimeline={uiSettings.showMiniTimeline}
              composer={<InputBar onSubmit={createBlock} embedded />}
              notebooks={notebooks}
              tagSuggestions={tags}
              onSave={updateBlock}
              onDelete={removeBlock}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onTagClick={(tagName) => {
                void handleBrowseTag(tagName)
              }}
              onLoadMore={loadMore}
              onAddToNotebook={handleAddBlockToNotebook}
              onCreateNotebookWithBlock={handleCreateNotebookWithBlock}
              onFindRelated={(blockId) => { void handleFindRelated(blockId) }}
              focusedBlockId={focusedBlockId}
              onFocusedBlockHandled={() => {
                setFocusedBlockId(null)
              }}
              upcomingDays={calendarSettings.upcomingDays}
              onOpenCalendarDate={(dateKey) => {
                setCalendarSelectedDateOverride(dateKey)
                setActiveView('calendar')
              }}
              onOpenReview={(mode, dateKey) => {
                void changbu.review.openWindow(mode, dateKey).catch((reason) => {
                  toast('error', reason instanceof Error ? reason.message : '打开回顾窗口失败。')
                })
              }}
            />
          </div>
        )
      case 'calendar':
        return (
          <CalendarView
            settings={calendarSettings}
            selectedDateOverride={calendarSelectedDateOverride}
            onSelectedDateOverrideHandled={() => {
              setCalendarSelectedDateOverride(null)
            }}
            onJumpToBlock={async (blockId) => {
              await ensureBlockLoaded(blockId)
              setActiveView('timeline')
              setFocusedBlockId(blockId)
            }}
          />
        )
      case 'notebooks':
        return (
          <NotebookWorkspace
            notebooks={notebooks}
            selectedNotebookId={selectedNotebookId}
            selectedNotebook={selectedNotebook}
            loading={notebooksLoading}
            loadingNotebook={loadingNotebook}
            searching={notebookSearching}
            searchQuery={searchQuery}
            searchResults={notebookResults}
            searchError={searchError}
            error={notebooksError}
            tagSuggestions={tags}
            onSelectNotebook={selectNotebook}
            onCreateNotebook={handleCreateNotebook}
            onUpdateNotebookTitle={async (notebookId, title) => {
              await updateNotebook(notebookId, title)
            }}
            onDeleteNotebook={async (notebookId) => {
              await removeNotebook(notebookId)
              toast('success', '笔记本已删除。')
            }}
            onCreateBlockInNotebook={async (notebookId, content) => {
              await createBlockInNotebook(notebookId, content)
              toast('success', '新块已加入当前笔记本。')
            }}
            onCreateNotebookStructureItem={async (notebookId, type) => {
              await createNotebookStructureItem(notebookId, { type })
              toast('success', '结构项已加入当前笔记本。')
            }}
            onUpdateNotebookStructureItem={async (notebookId, itemId, patch) => {
              await updateNotebookStructureItem(notebookId, itemId, patch)
            }}
            onUpdateBlock={updateBlock}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onTagClick={(tagName) => {
              void handleNotebookBrowseTag(tagName)
            }}
            onRemoveNotebookItem={async (notebookId, itemId) => {
              await removeNotebookItem(notebookId, itemId)
              toast('success', '该块已从笔记本移出。')
            }}
            onReorderNotebookItems={async (notebookId, itemIds) => {
              await reorderItems(notebookId, itemIds)
            }}
            onSearchQueryChange={setSearchQuery}
            onSearch={async () => {
              await handleNotebookSearch()
            }}
            onAddSearchResultToNotebook={async (blockId) => {
              if (!selectedNotebook) {
                return
              }

              await handleAddBlockToNotebook(selectedNotebook.id, blockId)
            }}
          />
        )
      case 'search':
        return (
          <SearchPanel
            query={searchQuery}
            results={displayedSearchResults}
            resultsTitle={searchResultsTitle}
            resultsEmptyHint={searchResultsEmptyHint}
            showResultScore={!showRecentResults}
            resultMetaLabel={showRecentResults ? '最近更新' : null}
            browseTag={browseTag}
            searchError={searchError}
            searching={searching}
            generating={generating}
            document={document}
            documentReferences={documentReferences}
            documentReferencesLoading={documentReferencesLoading}
            selectedNotebook={selectedNotebook ? { id: selectedNotebook.id, title: selectedNotebook.title } : null}
            documentDepositAction={documentDepositAction}
            onQueryChange={(value) => {
              setSearchQuery(value)
              if (!value.trim()) {
                setBrowseTag(null)
                setHasSearched(false)
              }
            }}
            onSearch={() => {
              void handleSearch()
            }}
            onGenerate={() => {
              void handleGenerate()
            }}
            onSaveSnapshot={() => {
              void handleSaveSnapshot()
            }}
            onDepositToNewNotebook={() => {
              void handleDepositDocumentToNewNotebook()
            }}
            onDepositToCurrentNotebook={() => {
              void handleDepositDocumentToCurrentNotebook()
            }}
            onClearBrowseTag={() => {
              setBrowseTag(null)
              setResults([])
              setSearchError(null)
              setHasSearched(false)
            }}
            onTagClick={(tagName) => {
              void handleBrowseTag(tagName)
            }}
            inputRef={searchInputRef}
          />
        )
      case 'graph':
        return (
          <GraphView
            nodes={graphData.nodes}
            edges={graphData.edges}
            loading={graphLoading}
            selectedBlockId={selectedGraphBlockId}
            selectedBlock={selectedGraphBlock}
            availableTags={tags}
            activeTagFilters={graphTagFilters}
            onToggleTagFilter={(tagName) => {
              setGraphTagFilters((current) => (current.includes(tagName) ? current.filter((name) => name !== tagName) : [...current, tagName]))
            }}
            onClearFilters={() => {
              setGraphTagFilters([])
            }}
            onSelectNode={async (blockId) => {
              setSelectedGraphBlockId(blockId)
              const loadedBlock = blocks.find((block) => block.id === blockId)

              if (loadedBlock) {
                setSelectedGraphBlockFallback(loadedBlock)
                return
              }

              graphSelectionRequestRef.current = blockId
              setSelectedGraphBlockFallback(null)

              try {
                const fetchedBlock = await changbu.blocks.get(blockId)

                if (graphSelectionRequestRef.current === blockId) {
                  setSelectedGraphBlockFallback(fetchedBlock)
                }
              } catch {
                if (graphSelectionRequestRef.current === blockId) {
                  setSelectedGraphBlockFallback(null)
                }
              }
            }}
            onJumpToBlock={async (blockId) => {
              await ensureBlockLoaded(blockId)
              setActiveView('timeline')
              setFocusedBlockId(blockId)
              setSelectedGraphBlockId(blockId)
            }}
          />
        )
      case 'snapshots':
        return (
          <SnapshotsView
            snapshots={snapshots}
            selectedSnapshotId={selectedSnapshotId}
            snapshotQuery={snapshotQuery}
            importPreview={importPreview}
            onSnapshotQueryChange={(value) => {
              setSnapshotQuery(value)
            }}
            onSelectSnapshot={setSelectedSnapshotId}
            onRemoveSnapshot={async (snapshotId) => {
              await changbu.snapshots.remove(snapshotId)
              await queryClient.invalidateQueries({ queryKey: queryKeys.snapshotsRoot() })
              toast('success', '文档快照已删除。')
            }}
            onExportMarkdown={async (options) => {
              try {
                const result = await changbu.exports.markdown(options)

                if (!result) {
                  toast('info', '已取消 Markdown 导出。')
                  return
                }

                toast('success', `Markdown 已导出到 ${result.path}，共 ${result.count} 个块。`)
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : 'Markdown 导出失败。')
              }
            }}
            onExportJson={async (options) => {
              try {
                const result = await changbu.exports.json(options)

                if (!result) {
                  toast('info', '已取消 JSON 导出。')
                  return
                }

                toast('success', `JSON 备份已导出到 ${result.path}，共 ${result.count} 个块。`)
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : 'JSON 导出失败。')
              }
            }}
            onPreviewMarkdownImport={async () => {
              try {
                const preview = await changbu.imports.previewMarkdown()

                if (!preview) {
                  setImportPreview(null)
                  toast('info', '已取消 Markdown 导入。')
                  return
                }

                setImportPreview(preview)
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : 'Markdown 导入预览失败。')
              }
            }}
            onPreviewJsonImport={handlePreviewJsonImport}
            onConfirmImport={handleConfirmImport}
            onDismissImportPreview={() => {
              setImportPreview(null)
            }}
          />
        )
      case 'data-management':
        return <DataManagementView />
    }
  }

  return (
    <>
      <ChangbuEventBridge />

      <div className="flex h-screen overflow-hidden bg-stone-100 text-stone-900">
        <AppSidebar
          activeView={activeView}
          blockCount={meta?.totalBlockCount ?? blocks.length}
          aiStatusLabel={aiStatusLabel}
          meta={meta}
          onSelectView={setActiveView}
          onPrefetchView={prefetchViewResources}
          onOpenSettings={() => {
            void changbu.settings.openWindow()
          }}
        />

        <main className="relative flex min-w-0 flex-1 overflow-hidden bg-white/[0.94]">
          {isWaitingToQuit ? (
            <div className="pointer-events-none absolute inset-x-6 top-4 z-20 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(120,53,15,0.08)]">
              正在等待后台 AI / 向量任务完成后退出，请稍候。
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* macOS 交通灯按钮区域 — 与侧边栏对齐 */}
            <div className="window-drag-region flex h-12 shrink-0 items-center border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,244,237,0.58))] px-5 lg:h-14 lg:px-7">
              <h2 className="text-[17px] font-semibold tracking-[0.01em] text-stone-900">{activeViewTitle}</h2>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 px-4 pb-2.5 pt-1.5 lg:px-6 lg:pt-2">
              <div key={activeView} className="flex min-h-0 min-w-0 flex-1 animate-[fadeIn_200ms_ease-out] overflow-hidden">
                {renderActiveView()}
              </div>
            </div>
          </div>

          {relatedBlocks !== null && (
            <aside className="hidden min-h-0 w-72 shrink-0 overflow-y-auto border-l border-stone-200 bg-stone-50/85 p-4 xl:flex xl:w-80 xl:flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400">相关块</h3>
                <button
                  type="button"
                  onClick={() => setRelatedBlocks(null)}
                  className="text-xs text-stone-400 transition hover:text-stone-600"
                >
                  关闭
                </button>
              </div>
              {relatedLoading ? (
                <p className="py-8 text-center text-sm text-stone-400">查找中…</p>
              ) : relatedBlocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">未找到相关块。</p>
              ) : (
                <div className="space-y-2">
                  {relatedBlocks.map(({ block: related, score }) => (
                    <div key={related.id}>
                      <BlockCard
                        block={related}
                        compact
                        editable={false}
                        headerActions={
                          <span className="text-[11px] font-medium text-stone-400">
                            {Math.round(score * 100)}%
                          </span>
                        }
                        onTagClick={(tagName) => { void handleBrowseTag(tagName) }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </main>
      </div>
    </>
  )
}

function applyDocChunk(current: DocumentState, chunk: DocGenerationChunk): DocumentState {
  const nextContent = chunk.fullText ?? `${current.content}${chunk.delta}`

  return {
    status: chunk.error ? 'error' : chunk.done ? 'done' : 'streaming',
    requestId: chunk.requestId,
    topic: chunk.topic,
    content: nextContent,
    blockIds: current.blockIds,
    mode: chunk.mode,
    error: chunk.error ?? null,
  }
}
