import { startTransition, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_AI_CONFIG,
  DEFAULT_DOC_GENERATION_SETTINGS,
  DOC_GENERATION_SETTINGS_KEY,
  normalizeDocGenerationSettings,
  parseDocGenerationSettings,
} from '../shared/config'
import type { AIConfig, AIExecutionMode, ApiTestResult, AppMeta, Block, DocGenerationChunk, DocGenerationSettings, SearchResult } from '../shared/types'
import { AppSidebar, type AppView } from './components/AppSidebar'
import { GraphView } from './components/GraphView'
import { InputBar } from './components/InputBar'
import { SearchPanel } from './components/SearchPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SnapshotsView } from './components/SnapshotsView'
import { Timeline } from './components/Timeline'
import { ToastProvider, useToast } from './components/Toast'
import { useBlocks } from './hooks/useBlocks'
import { useTags } from './hooks/useTags'
import { changbu } from './lib/changbu'

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

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const { toast } = useToast()
  const { blocks, loading, loadingMore, hasMore, error, createBlock, updateBlock, removeBlock, addTag, removeTag, loadMore, ensureBlockLoaded } = useBlocks()
  const { tags, refresh: refreshTags } = useTags()
  const [activeView, setActiveView] = useState<AppView>('timeline')
  const [searchQuery, setSearchQuery] = useState('')
  const [browseTag, setBrowseTag] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [document, setDocument] = useState<DocumentState>(initialDocumentState)
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG)
  const [docGenerationSettings, setDocGenerationSettings] = useState<DocGenerationSettings>(DEFAULT_DOC_GENERATION_SETTINGS)
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsTesting, setSettingsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null)
  const searchInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphData, setGraphData] = useState<{ nodes: import('../shared/types').GraphNode[]; edges: import('../shared/types').GraphEdge[] }>({
    nodes: [],
    edges: [],
  })
  const [graphTagFilters, setGraphTagFilters] = useState<string[]>([])
  const [selectedGraphBlockId, setSelectedGraphBlockId] = useState<string | null>(null)
  const [selectedGraphBlockFallback, setSelectedGraphBlockFallback] = useState<Block | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<import('../shared/types').Snapshot[]>([])
  const [snapshotQuery, setSnapshotQuery] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<import('../shared/types').ImportPreview | null>(null)
  const graphSelectionRequestRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    void changbu.settings.get('ai_config').then((saved) => {
      if (!active || !saved) {
        return
      }

      try {
        const parsed = JSON.parse(saved) as AIConfig
        setConfig({
          llm: {
            ...DEFAULT_AI_CONFIG.llm,
            ...parsed.llm,
          },
          embedding: {
            ...DEFAULT_AI_CONFIG.embedding,
            ...parsed.embedding,
          },
        })
      } catch {
        setConfig(DEFAULT_AI_CONFIG)
      }
    })

    void changbu.settings.get(DOC_GENERATION_SETTINGS_KEY).then((saved) => {
      if (!active) {
        return
      }

      setDocGenerationSettings(parseDocGenerationSettings(saved))
    })

    void refreshMeta().then((appMeta) => {
      if (active) {
        setMeta(appMeta)
      }
    })

    const unsubscribe = changbu.events.onDocGenerationChunk((chunk) => {
      if (!active) {
        return
      }

      startTransition(() => {
        setDocument((current) => {
          if (current.requestId && current.requestId !== chunk.requestId) {
            return current
          }

          return applyDocChunk(current, chunk)
        })
      })

      if (chunk.done) {
        setGenerating(false)
        void refreshMeta().then((appMeta) => {
          if (active) {
            setMeta(appMeta)
          }
        })
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'graph') {
      return
    }

    let active = true
    setGraphLoading(true)
    void changbu.graph
      .getData(graphTagFilters)
      .then((nextGraphData) => {
        if (active) {
          setGraphData(nextGraphData)
        }
      })
      .finally(() => {
        if (active) {
          setGraphLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeView, graphTagFilters])

  useEffect(() => {
    if (activeView !== 'snapshots') {
      return
    }

    let active = true
    void changbu.snapshots.list(snapshotQuery).then((items) => {
      if (active) {
        setSnapshots(items)
        if (!selectedSnapshotId && items.length > 0) {
          setSelectedSnapshotId(items[0].id)
        }
      }
    })

    return () => {
      active = false
    }
  }, [activeView, snapshotQuery, selectedSnapshotId])

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


  async function refreshMeta(): Promise<AppMeta> {
    const nextMeta = await changbu.settings.getMeta()
    setMeta(nextMeta)
    return nextMeta
  }

  function handleConfigChange(nextConfig: AIConfig): void {
    setConfig(nextConfig)
    setTestResult(null)
  }

  async function handleSearch(): Promise<void> {
    const query = searchQuery.trim()

    if (!query) {
      return
    }

    setHasSearched(true)
    setSearching(true)
    setSearchError(null)
    setBrowseTag(null)

    try {
      const nextResults = await changbu.search.blocks(query, 20)
      startTransition(() => {
        setResults(nextResults)
      })
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : '搜索失败。')
    } finally {
      setSearching(false)
      void refreshMeta()
    }
  }

  async function handleBrowseTag(tagName: string): Promise<void> {
    setActiveView('search')
    setHasSearched(true)
    setBrowseTag(tagName)
    setSearchQuery(tagName)
    setSearchError(null)
    setSearching(true)

    try {
      const nextResults = await changbu.search.byTag(tagName, 50)
      setResults(nextResults)
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : '按标签浏览失败。')
    } finally {
      setSearching(false)
    }
  }

  async function handleGenerate(): Promise<void> {
    const topic = searchQuery.trim()

    if (!topic) {
      return
    }

    setGenerating(true)
    setSearchError(null)
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

  async function refreshSnapshots(nextQuery = snapshotQuery): Promise<void> {
    const items = await changbu.snapshots.list(nextQuery)
    setSnapshots(items)
    if (items.length > 0 && (!selectedSnapshotId || !items.some((snapshot) => snapshot.id === selectedSnapshotId))) {
      setSelectedSnapshotId(items[0].id)
    }
    if (items.length === 0) {
      setSelectedSnapshotId(null)
    }
  }

  async function handleSaveSettings(): Promise<void> {
    setSettingsSaving(true)
    const normalizedDocGenerationSettings = normalizeDocGenerationSettings(docGenerationSettings)

    try {
      await changbu.settings.set('ai_config', JSON.stringify(config))
      await changbu.settings.set(DOC_GENERATION_SETTINGS_KEY, JSON.stringify(normalizedDocGenerationSettings))
      setDocGenerationSettings(normalizedDocGenerationSettings)
      const nextMeta = await refreshMeta()
      toast(
        nextMeta.activeAiMode === 'live' ? 'success' : 'info',
        nextMeta.activeAiMode === 'live'
          ? `设置已保存，当前使用 live AI。文档生成最多引用 ${normalizedDocGenerationSettings.maxReferenceBlocks} 个块。`
          : `设置已保存，但尚未通过测试，当前仍使用 mock。文档生成最多引用 ${normalizedDocGenerationSettings.maxReferenceBlocks} 个块。`,
      )
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleTestSettings(): Promise<void> {
    setSettingsTesting(true)

    try {
      const result = await changbu.settings.testApi(config)
      setTestResult(result)
      await refreshMeta()
    } finally {
      setSettingsTesting(false)
    }
  }

  async function handleSaveSnapshot(): Promise<void> {
    if (!document.content.trim()) {
      return
    }

    const snapshot = await changbu.snapshots.save(document.topic, document.content, document.blockIds)
    await refreshSnapshots()
    setSelectedSnapshotId(snapshot.id)
    setActiveView('snapshots')
    toast('success', '文档快照已保存。')
  }

  const selectedGraphBlock = selectedGraphBlockId ? blocks.find((block) => block.id === selectedGraphBlockId) ?? selectedGraphBlockFallback : null
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
    search: '搜索生成',
    graph: '连接图',
    snapshots: '文档快照',
    settings: '设置',
  }[activeView]

  function renderActiveView(): React.ReactNode {
    switch (activeView) {
      case 'timeline':
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {error ? (
              <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            <Timeline
              blocks={blocks}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              composer={<InputBar onSubmit={createBlock} embedded />}
              tagSuggestions={tags}
              onSave={updateBlock}
              onDelete={removeBlock}
              onAddTag={async (blockId, tagName) => {
                await addTag(blockId, tagName)
                await refreshTags()
              }}
              onRemoveTag={async (blockId, tagId) => {
                await removeTag(blockId, tagId)
                await refreshTags()
              }}
              onTagClick={(tagName) => {
                void handleBrowseTag(tagName)
              }}
              onLoadMore={loadMore}
              focusedBlockId={focusedBlockId}
              onFocusedBlockHandled={() => {
                setFocusedBlockId(null)
              }}
            />
          </div>
        )
      case 'search':
        return (
          <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
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
          </div>
        )
      case 'graph':
        return (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <GraphView
            nodes={graphData.nodes}
            edges={graphData.edges}
            loading={graphLoading}
            selectedBlock={selectedGraphBlock}
            availableTags={tags}
            activeTagFilters={graphTagFilters}
            onToggleTagFilter={(tagName) => {
              setGraphTagFilters((current) => (current.includes(tagName) ? current.filter((name) => name !== tagName) : [...current, tagName]))
            }}
            onSelectNode={async (blockId) => {
              setSelectedGraphBlockId(blockId)
              const loadedBlock = blocks.find((block) => block.id === blockId)

              if (loadedBlock) {
                setSelectedGraphBlockFallback(loadedBlock)
                return
              }

              graphSelectionRequestRef.current = blockId

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
          </div>
        )
      case 'snapshots':
        return (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SnapshotsView
            snapshots={snapshots}
            selectedSnapshotId={selectedSnapshotId}
            snapshotQuery={snapshotQuery}
            importPreview={importPreview}
            availableTags={tags}
            onSnapshotQueryChange={(value) => {
              setSnapshotQuery(value)
            }}
            onSelectSnapshot={setSelectedSnapshotId}
            onRemoveSnapshot={async (snapshotId) => {
              await changbu.snapshots.remove(snapshotId)
              await refreshSnapshots()
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
            onPreviewJsonImport={async () => {
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
            }}
            onConfirmImport={async (strategy) => {
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
            }}
            onDismissImportPreview={() => {
              setImportPreview(null)
            }}
          />
          </div>
        )
      case 'settings':
        return (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsPanel
            config={config}
            docGenerationSettings={docGenerationSettings}
            meta={meta}
            saving={settingsSaving}
            testing={settingsTesting}
            testResult={testResult}
            onChange={handleConfigChange}
            onDocGenerationSettingsChange={setDocGenerationSettings}
            onSave={handleSaveSettings}
            onTest={handleTestSettings}
            onOpenDataDirectory={async () => {
              await changbu.settings.openDataDirectory()
            }}
          />
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-100 text-stone-900">
      <AppSidebar
        activeView={activeView}
        blockCount={blocks.length}
        aiStatusLabel={aiStatusLabel}
        meta={meta}
        searchQuery={searchQuery}
        onSelectView={setActiveView}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white/[0.92]">
        {/* macOS 交通灯按钮区域 — 与侧边栏对齐 */}
        <div className="h-12 shrink-0 flex items-end px-5 pb-1">
          <h2 className="text-[13px] font-semibold text-stone-900">{activeViewTitle}</h2>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden px-5 py-3">
          <div key={activeView} className="flex flex-1 flex-col overflow-hidden animate-[fadeIn_200ms_ease-out]">
            {renderActiveView()}
          </div>
        </div>
      </main>
    </div>
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
