import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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
  SnapshotUpdateInput,
} from '../shared/types'
import { expandBlockChangedEvents } from '../shared/eventBatch'
import { buildSearchPreview } from '../shared/searchPreview'
import { AppSidebar, type AppView } from './components/AppSidebar'
import { BlockCard } from './components/BlockCard'
import { ChangbuEventBridge } from './components/ChangbuEventBridge'
import { InputBar } from './components/InputBar'
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
import type { BlockListChangeHint } from './lib/blockListCache'
import { changbu } from './lib/changbu'
import { loadDocumentReferences } from './lib/documentReferences'
import { resolveSelectedGraphBlock } from './lib/graphSelection'
import { queryKeys } from './lib/queryKeys'
import { useI18n } from './i18n/useI18n'
import { getCurrentLanguage } from './i18n/locale'

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

const STARTUP_PREFETCH_PLAN: Array<{ view: AppView; delayMs: number }> = [
  { view: 'calendar', delayMs: 260 },
  { view: 'snapshots', delayMs: 920 },
  { view: 'graph', delayMs: 1560 },
  { view: 'data-management', delayMs: 2240 },
]

const loadCalendarView = () => import('./components/CalendarView')
const loadNotebookWorkspace = () => import('./components/NotebookWorkspace')
const loadSearchPanel = () => import('./components/SearchPanel')
const loadGraphView = () => import('./components/GraphView')
const loadSnapshotsView = () => import('./components/SnapshotsView')
const loadDataManagementView = () => import('./components/DataManagementView')

const LazyCalendarView = lazy(() => loadCalendarView().then((module) => ({ default: module.CalendarView })))
const LazyNotebookWorkspace = lazy(() => loadNotebookWorkspace().then((module) => ({ default: module.NotebookWorkspace })))
const LazySearchPanel = lazy(() => loadSearchPanel().then((module) => ({ default: module.SearchPanel })))
const LazyGraphView = lazy(() => loadGraphView().then((module) => ({ default: module.GraphView })))
const LazySnapshotsView = lazy(() => loadSnapshotsView().then((module) => ({ default: module.SnapshotsView })))
const LazyDataManagementView = lazy(() => loadDataManagementView().then((module) => ({ default: module.DataManagementView })))

const VIEW_MODULE_PRELOADERS: Partial<Record<AppView, () => Promise<unknown>>> = {
  calendar: loadCalendarView,
  notebooks: loadNotebookWorkspace,
  search: loadSearchPanel,
  graph: loadGraphView,
  snapshots: loadSnapshotsView,
  'data-management': loadDataManagementView,
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
    handlers.onError(reason instanceof Error ? reason.message : (getCurrentLanguage() === 'en' ? 'Search failed.' : '搜索失败。'))
  } finally {
    handlers.onFinally?.()
  }
}

function applyBlockChangeToSearchResults(
  results: SearchResult[],
  event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' },
  query: string,
): SearchResult[] {
  if (!results.some((item) => item.block.id === event.block.id)) {
    return results
  }

  if (event.reason === 'deleted') {
    return results.filter((item) => item.block.id !== event.block.id)
  }

  return results.map((item) => (
    item.block.id === event.block.id
      ? {
          ...item,
          block: event.block,
          preview: buildSearchPreview(event.block.content, query),
        }
      : item
  ))
}

function applyBlockChangesToSearchResults(results: SearchResult[], events: Array<{ block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }>, query: string): SearchResult[] {
  return events.reduce((current, event) => applyBlockChangeToSearchResults(current, event, query), results)
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const { t, uiSettings } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const {
    blocks,
    blockChangeHint,
    loading,
    loadingMore,
    hasMore,
    error,
    createBlock,
    updateBlock,
    removeBlock,
    addTag,
    removeTag,
    loadMore,
  } = useBlocks()
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
  const [jumpingToTimelineBlockId, setJumpingToTimelineBlockId] = useState<string | null>(null)
  const [timelineContextBlocks, setTimelineContextBlocks] = useState<Block[]>([])
  const [isWaitingToQuit, setIsWaitingToQuit] = useState(false)
  const { calendarSettings } = useAppShellSettings()
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
  const prefetchedViewsRef = useRef<Set<AppView>>(new Set(['timeline']))
  const scheduledPrefetchesRef = useRef<Partial<Record<AppView, ReturnType<typeof setTimeout>>>>({})
  const metaQuery = useAppMeta()
  const meta = metaQuery.data ?? null
  const graphQuery = useGraphData(graphTagFilters, activeView === 'graph')
  const graphData = graphQuery.data ?? { nodes: [], edges: [], forceGraphData: { nodes: [], links: [] } }
  const graphLoading = graphQuery.isPending && graphData.nodes.length === 0 && graphData.edges.length === 0
  const snapshotsQuery = useSnapshots(snapshotQuery, null, activeView === 'snapshots')
  const snapshots = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data])
  const timelineBlocks = useMemo(
    () => (timelineContextBlocks.length > 0 ? timelineContextBlocks : blocks),
    [blocks, timelineContextBlocks],
  )
  const timelineBlockChangeHint = useMemo<BlockListChangeHint>(
    () => (timelineContextBlocks.length > 0 ? { type: 'reset' } : blockChangeHint),
    [blockChangeHint, timelineContextBlocks.length],
  )

  const refreshMeta = useCallback(async (): Promise<AppMeta> => {
    await queryClient.refetchQueries({ queryKey: queryKeys.meta(), exact: true })
    const result = queryClient.getQueryData<AppMeta>(queryKeys.meta())

    if (!result) {
      throw new Error(t('settings.controller.refreshMetaFailed'))
    }

    return result
  }, [queryClient, t])

  const clearScheduledPrefetch = useCallback((view?: AppView): void => {
    if (view) {
      const timer = scheduledPrefetchesRef.current[view]

      if (timer) {
        clearTimeout(timer)
        delete scheduledPrefetchesRef.current[view]
      }

      return
    }

    for (const scheduledView of Object.keys(scheduledPrefetchesRef.current) as AppView[]) {
      const timer = scheduledPrefetchesRef.current[scheduledView]

      if (timer) {
        clearTimeout(timer)
      }
    }

    scheduledPrefetchesRef.current = {}
  }, [])

  const prefetchQueryIfNeeded = useCallback(
    async <T,>(options: {
      queryKey: readonly unknown[]
      queryFn: () => Promise<T>
    }): Promise<void> => {
      const queryState = queryClient.getQueryState(options.queryKey)

      if (queryState?.fetchStatus === 'fetching' || queryState?.status === 'success') {
        return
      }

      await queryClient.prefetchQuery(options)
    },
    [queryClient],
  )

  const runPrefetchViewResources = useCallback((view: AppView): void => {
    const currentYear = new Date().getFullYear()
    const today = formatTodayDateKey()
    prefetchedViewsRef.current.add(view)
    void VIEW_MODULE_PRELOADERS[view]?.()

    switch (view) {
      case 'calendar':
        void Promise.allSettled([
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarYears(),
            queryFn: () => changbu.calendar.listYears(),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarHeatmap(currentYear),
            queryFn: () => changbu.calendar.getYearHeatmap(currentYear),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarDay(today),
            queryFn: () => changbu.calendar.getDayDetail(today),
          }),
          prefetchQueryIfNeeded({
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
        void prefetchQueryIfNeeded({
          queryKey: queryKeys.graph(graphTagFilters),
          queryFn: () => changbu.graph.getData(graphTagFilters),
        })
        return
      case 'snapshots':
        void prefetchQueryIfNeeded({
          queryKey: queryKeys.snapshots('', null),
          queryFn: () => changbu.snapshots.list('', null),
        })
        return
      case 'data-management':
        void Promise.allSettled([
          prefetchQueryIfNeeded({
            queryKey: queryKeys.dataManagement(),
            queryFn: () => changbu.data.getOverview(),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.blockCleanupDays(),
            queryFn: fetchBlockCleanupDays,
          }),
        ])
        return
      case 'timeline':
        return
    }
  }, [calendarSettings.upcomingDays, graphTagFilters, prefetchQueryIfNeeded])

  const prefetchViewResources = useCallback((view: AppView): void => {
    clearScheduledPrefetch(view)
    runPrefetchViewResources(view)
  }, [clearScheduledPrefetch, runPrefetchViewResources])

  useEffect(() => {
    if (loading) {
      return
    }

    for (const { view, delayMs } of STARTUP_PREFETCH_PLAN) {
      if (prefetchedViewsRef.current.has(view) || scheduledPrefetchesRef.current[view]) {
        continue
      }

      scheduledPrefetchesRef.current[view] = setTimeout(() => {
        delete scheduledPrefetchesRef.current[view]
        runPrefetchViewResources(view)
      }, delayMs)
    }

    return () => {
      clearScheduledPrefetch()
    }
  }, [clearScheduledPrefetch, loading, runPrefetchViewResources])

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
    return changbu.events.onBatch((batch) => {
      const blockEvents = expandBlockChangedEvents(batch)

      if (blockEvents.length === 0) {
        return
      }

      startTransition(() => {
        setResults((current) => applyBlockChangesToSearchResults(current, blockEvents, searchQuery))
        setNotebookResults((current) => applyBlockChangesToSearchResults(current, blockEvents, searchQuery))
        setDocumentReferences((current) => applyBlockChangesToSearchResults(current, blockEvents, document.topic || searchQuery))
        setTimelineContextBlocks((current) => {
          let nextBlocks = current

          for (const event of blockEvents) {
            if (!nextBlocks.some((block) => block.id === event.block.id)) {
              continue
            }

            nextBlocks = event.reason === 'deleted'
              ? nextBlocks.filter((block) => block.id !== event.block.id)
              : nextBlocks.map((block) => (block.id === event.block.id ? event.block : block))
          }

          return nextBlocks
        })
      })
    })
  }, [document.topic, searchQuery])

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
      const references = await loadDocumentReferences(changbu.blocks.getMany, blockIds, document.topic || searchQuery)

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
          setSearchError(message === t('app.search.error') ? t('app.search.byTagError') : message)
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
          setSearchError(message === t('app.search.error') ? t('app.search.byTagError') : message)
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
        error: reason instanceof Error ? reason.message : t('app.doc.generateError'),
      })
      void refreshMeta()
    }
  }


  async function handlePreviewJsonImport(): Promise<void> {
    try {
      const preview = await changbu.imports.previewJson()

      if (!preview) {
        setImportPreview(null)
        toast('info', t('app.import.json.cancelled'))
        return
      }

      setImportPreview(preview)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : t('app.import.json.previewFailed'))
    }
  }

  async function handleConfirmImport(strategy: ImportConflictStrategy): Promise<void> {
    if (!importPreview) {
      return
    }

    try {
      const result = await changbu.imports.confirm(importPreview.importId, strategy)
      setImportPreview(null)
      toast('success', t('app.import.done', { count: result.imported }))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : t('app.import.failed'))
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
    toast('success', t('app.snapshot.saved'))
  }

  async function handleUpdateSnapshot(snapshotId: string, patch: SnapshotUpdateInput): Promise<void> {
    try {
      const snapshot = await changbu.snapshots.update(snapshotId, patch)
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshotsRoot() })
      setSelectedSnapshotId(snapshot.id)
      toast('success', t('app.snapshot.updated'))
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : t('app.snapshot.updateFailed'))
      throw reason instanceof Error ? reason : new Error(t('app.snapshot.updateFailed'))
    }
  }

  async function handleDepositDocumentToNewNotebook(): Promise<void> {
    if (!document.content.trim() || document.blockIds.length === 0 || documentDepositAction) {
      return
    }

    setDocumentDepositAction('create')

    try {
      const notebookTitle = document.topic.trim() || t('app.notebook.newName', { index: notebooks.length + 1 })
      const notebook = await createNotebook(notebookTitle)

      for (const blockId of document.blockIds) {
        await addBlockToNotebook(notebook.id, blockId)
      }

      toast('success', t('app.notebook.depositCreated', { title: notebook.title }))
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

      toast('success', t('app.notebook.depositAppended', { title: selectedNotebook.title }))
      setActiveView('notebooks')
    } finally {
      setDocumentDepositAction(null)
    }
  }

  async function handleAddBlockToNotebook(notebookId: string, blockId: string): Promise<void> {
    const result = await addBlockToNotebook(notebookId, blockId)
    toast(result.added ? 'success' : 'info', result.added ? t('app.notebook.addedTo', { title: result.notebook.title }) : t('app.notebook.alreadyIn', { title: result.notebook.title }))
  }

  async function handleCreateNotebookWithBlock(blockId: string): Promise<void> {
    const notebookTitle = t('app.notebook.newName', { index: notebooks.length + 1 })
    const result = await createNotebookWithBlock(blockId, notebookTitle)
    toast('success', t('app.notebook.createdWithBlock', { title: result.notebook.title }))
    setActiveView('notebooks')
  }

  async function handleCreateNotebook(): Promise<void> {
    const notebook = await createNotebook(t('app.notebook.newName', { index: notebooks.length + 1 }))
    toast('success', t('app.notebook.created', { title: notebook.title }))
    setActiveView('notebooks')
  }

  async function handleFindRelated(blockId: string): Promise<void> {
    setRelatedLoading(true)
    try {
      const results = await changbu.blocks.findRelated(blockId)
      setRelatedBlocks(results)
    } catch {
      toast('error', t('app.related.findFailed'))
    } finally {
      setRelatedLoading(false)
    }
  }

  async function handleJumpToTimeline(blockId: string): Promise<boolean> {
    if (jumpingToTimelineBlockId) {
      return false
    }

    setJumpingToTimelineBlockId(blockId)

    try {
      const blockInLoadedPages = blocks.some((block) => block.id === blockId)

      if (blockInLoadedPages) {
        setTimelineContextBlocks([])
      } else {
        const contextBlocks = await changbu.blocks.getContext(blockId, {
          before: 4,
          after: 4,
        })

        if (contextBlocks.length === 0 || !contextBlocks.some((block) => block.id === blockId)) {
          toast('error', t('app.timeline.locateFailed'))
          return false
        }

        setTimelineContextBlocks(contextBlocks)
      }

      setActiveView('timeline')
      setFocusedBlockId(blockId)
      return true
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : t('app.timeline.jumpFailed'))
      return false
    } finally {
      setJumpingToTimelineBlockId((current) => (current === blockId ? null : current))
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
      ? t('app.search.recentTitle', { count: recentResults.length })
      : t('app.search.recentTitleEmpty')
    : browseTag
      ? t('app.search.tagTitle', { tag: browseTag, count: results.length })
      : t('app.search.resultTitle', { count: results.length })
  const searchResultsEmptyHint = showRecentResults
    ? loading
      ? t('app.search.recentLoading')
      : t('app.search.recentEmpty')
    : browseTag
      ? t('app.search.tagEmpty')
      : t('app.search.empty')

  const aiStatusLabel = !meta?.aiConfigured
    ? t('app.aiStatus.mock')
    : meta.activeAiMode === 'live'
      ? meta.lastAiError
        ? t('app.aiStatus.liveError')
        : t('app.aiStatus.liveReady')
      : t('app.aiStatus.configSaved')

  const activeViewTitle = {
    timeline: t('app.sidebar.timeline'),
    calendar: t('app.sidebar.calendar'),
    search: t('app.sidebar.search'),
    notebooks: t('app.sidebar.notebooks'),
    graph: t('app.sidebar.graph'),
    snapshots: t('app.sidebar.snapshots'),
    'data-management': t('app.sidebar.dataManagement'),
  }[activeView]

  function renderActiveView(): ReactNode {
    switch (activeView) {
      case 'timeline':
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {error ? (
              <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            <TimelineWorkspace
              blocks={timelineBlocks}
              blockChangeHint={timelineBlockChangeHint}
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
                  toast('error', reason instanceof Error ? reason.message : t('app.review.openFailed'))
                })
              }}
            />
          </div>
        )
      case 'calendar':
        return (
          <LazyCalendarView
            settings={calendarSettings}
            selectedDateOverride={calendarSelectedDateOverride}
            onSelectedDateOverrideHandled={() => {
              setCalendarSelectedDateOverride(null)
            }}
            onJumpToBlock={async (blockId) => {
              await handleJumpToTimeline(blockId)
            }}
          />
        )
      case 'notebooks':
        return (
          <LazyNotebookWorkspace
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
              toast('success', t('app.notebook.deleted'))
            }}
            onCreateBlockInNotebook={async (notebookId, content) => {
              await createBlockInNotebook(notebookId, content)
              toast('success', t('app.notebook.blockAdded'))
            }}
            onCreateNotebookStructureItem={async (notebookId, type) => {
              await createNotebookStructureItem(notebookId, { type })
              toast('success', t('app.notebook.structureAdded'))
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
              toast('success', t('app.notebook.blockRemoved'))
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
          <LazySearchPanel
            query={searchQuery}
            results={displayedSearchResults}
            resultsTitle={searchResultsTitle}
            resultsEmptyHint={searchResultsEmptyHint}
            showResultScore={!showRecentResults}
            resultMetaLabel={showRecentResults ? t('app.search.recentTitleEmpty') : null}
            browseTag={browseTag}
            searchError={searchError}
            searching={searching}
            generating={generating}
            document={document}
            documentReferences={documentReferences}
            documentReferencesLoading={documentReferencesLoading}
            notebooks={notebooks}
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
            onJumpToTimeline={handleJumpToTimeline}
            jumpingToTimelineBlockId={jumpingToTimelineBlockId}
            tagSuggestions={tags}
            onUpdateResult={updateBlock}
            onDeleteResult={removeBlock}
            onAddTagToResult={addTag}
            onRemoveTagFromResult={removeTag}
            onFindRelatedResult={(blockId) => {
              void handleFindRelated(blockId)
            }}
            onAddResultToNotebook={handleAddBlockToNotebook}
            onCreateNotebookWithResult={handleCreateNotebookWithBlock}
            inputRef={searchInputRef}
          />
        )
      case 'graph':
        return (
          <LazyGraphView
            nodes={graphData.nodes}
            edges={graphData.edges}
            graphData={graphData.forceGraphData}
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
              const jumped = await handleJumpToTimeline(blockId)

              if (jumped) {
                setSelectedGraphBlockId(blockId)
              }
            }}
          />
        )
      case 'snapshots':
        return (
          <LazySnapshotsView
            snapshots={snapshots}
            selectedSnapshotId={selectedSnapshotId}
            snapshotQuery={snapshotQuery}
            importPreview={importPreview}
            onSnapshotQueryChange={(value) => {
              setSnapshotQuery(value)
            }}
            onSelectSnapshot={setSelectedSnapshotId}
            onUpdateSnapshot={handleUpdateSnapshot}
            onRemoveSnapshot={async (snapshotId) => {
              await changbu.snapshots.remove(snapshotId)
              await queryClient.invalidateQueries({ queryKey: queryKeys.snapshotsRoot() })
              toast('success', t('app.snapshots.removed'))
            }}
            onExportMarkdown={async (options) => {
              try {
                const result = await changbu.exports.markdown(options)

                if (!result) {
                  toast('info', t('app.export.markdown.cancelled'))
                  return
                }

                toast('success', t('app.export.markdown.done', { path: result.path, count: result.count }))
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : t('app.export.markdown.failed'))
              }
            }}
            onExportJson={async (options) => {
              try {
                const result = await changbu.exports.json(options)

                if (!result) {
                  toast('info', t('app.export.json.cancelled'))
                  return
                }

                toast('success', t('app.export.json.done', { path: result.path, count: result.count }))
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : t('app.export.json.failed'))
              }
            }}
            onPreviewMarkdownImport={async () => {
              try {
                const preview = await changbu.imports.previewMarkdown()

                if (!preview) {
                  setImportPreview(null)
                  toast('info', t('app.import.markdown.cancelled'))
                  return
                }

                setImportPreview(preview)
              } catch (reason) {
                toast('error', reason instanceof Error ? reason.message : t('app.import.markdown.previewFailed'))
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
        return <LazyDataManagementView />
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
          onSelectView={(view) => {
            if (view === 'timeline') {
              setTimelineContextBlocks([])
            }

            setActiveView(view)
          }}
          onPrefetchView={prefetchViewResources}
          onOpenSettings={() => {
            void changbu.settings.openWindow()
          }}
        />

        <main className="relative flex min-w-0 flex-1 overflow-hidden bg-white/[0.94]">
          {isWaitingToQuit ? (
            <div className="pointer-events-none absolute inset-x-6 top-4 z-20 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(120,53,15,0.08)]">
              {t('app.waitingQuit')}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* macOS 交通灯按钮区域 — 与侧边栏对齐 */}
            <div className="window-drag-region flex h-12 shrink-0 items-center border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,244,237,0.58))] px-5 lg:h-14 lg:px-7">
              <h2 className="text-[17px] font-semibold tracking-[0.01em] text-stone-900">{activeViewTitle}</h2>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 px-4 pb-2.5 pt-1.5 lg:px-6 lg:pt-2">
              <Suspense fallback={<ViewLoadingMask title={activeViewTitle} />}>
                <div key={activeView} className="flex min-h-0 min-w-0 flex-1 animate-[fadeIn_200ms_ease-out] overflow-hidden">
                  {renderActiveView()}
                </div>
              </Suspense>
            </div>
          </div>

          {relatedBlocks !== null && (
            <aside className="hidden min-h-0 w-72 shrink-0 overflow-y-auto border-l border-stone-200 bg-stone-50/85 p-4 xl:flex xl:w-80 xl:flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400">{t('app.related.title')}</h3>
                <button
                  type="button"
                  onClick={() => setRelatedBlocks(null)}
                  className="text-xs text-stone-400 transition hover:text-stone-600"
                >
                  {t('app.common.close')}
                </button>
              </div>
              {relatedLoading ? (
                <p className="py-8 text-center text-sm text-stone-400">{t('app.related.loading')}</p>
              ) : relatedBlocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">{t('app.related.empty')}</p>
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

function ViewLoadingMask({ title }: { title: string }) {
  const { t } = useI18n()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
      <div className="relative flex w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-[28px] border border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,241,233,0.92))] px-8 py-14 text-center shadow-[0_24px_60px_rgba(28,25,23,0.08)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(255,255,255,0)_60%)]" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white/90 shadow-sm">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
        </div>
        <p className="relative mt-5 text-sm font-medium tracking-[0.08em] text-stone-500">{t('app.view.loadingPreparing', { title })}</p>
        <h3 className="relative mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">{t('app.view.loadingTitle')}</h3>
        <p className="relative mt-3 max-w-lg text-sm leading-7 text-stone-500">
          {t('app.view.loadingHint')}
        </p>
      </div>
    </div>
  )
}
