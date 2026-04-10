import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'

import type { Block, GraphEdge, GraphNode, TagSuggestion } from '../../shared/types'
import { compareText } from '../i18n/locale'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { formatTimeLabel } from '../lib/format'
import { MarkdownContent } from './MarkdownContent'
import { StatusPill } from './StatusPill'

interface GraphViewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  graphData: {
    nodes: GraphNode[]
    links: GraphEdge[]
  }
  loading: boolean
  selectedBlockId: string | null
  selectedBlock: Block | null
  availableTags: TagSuggestion[]
  activeTagFilters: string[]
  onToggleTagFilter: (tagName: string) => void
  onClearFilters: () => void
  onSelectNode: (blockId: string) => void
  onJumpToBlock: (blockId: string) => void
}

const SUPPRESSED_FILTER_TAGS = new Set(['TODO', '重要', '临时', '归档'])

function getBlockTitle(block: Block, untitledLabel: string): string {
  const summary = block.summary?.trim()

  if (summary) {
    return summary
  }

  const firstLine = block.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ?? untitledLabel
}

interface GraphSelectionDetailProps {
  block: Block | null
  loading: boolean
  activeTagFilters: string[]
  onToggleTagFilter: (tagName: string) => void
  onJumpToBlock: (blockId: string) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

function GraphSelectionDetail({ block, loading, activeTagFilters, onToggleTagFilter, onJumpToBlock, t }: GraphSelectionDetailProps) {
  const activeTagSet = useMemo(() => new Set(activeTagFilters), [activeTagFilters])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-stone-400">{t('graph.loadingDetail')}</div>
  }

  if (!block) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm leading-7 text-stone-400">
        {t('graph.selectNodeHint')}<br />
        {t('graph.doubleClickHint')}
      </div>
    )
  }

  return (
    <article className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/[0.06] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-400">{t('graph.currentBlock')}</p>
            <h3 className="mt-1 text-base font-semibold leading-7 text-stone-900">{getBlockTitle(block, t('graph.untitledBlock'))}</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              void onJumpToBlock(block.id)
            }}
            className="shrink-0 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
          >
            {t('graph.backToTimeline')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <StatusPill status={block.status} />
          <span>{formatTimeLabel(block.updatedAt)}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600">{block.aiMode === 'live' ? t('graph.modeLive') : t('graph.modeMock')}</span>
        </div>

        {block.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.tags.map((tag) => {
              const active = activeTagSet.has(tag.name)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onToggleTagFilter(tag.name)}
                  title={active ? t('graph.tagFilterRemove') : t('graph.tagFilterAdd')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900'
                  }`}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-1">
        {block.summary ? <p className="mb-4 text-sm leading-6 text-stone-500">{block.summary}</p> : null}

        <div className="text-[15px] leading-8 text-stone-800">
          <MarkdownContent content={block.content} />
        </div>

        {block.errorMessage ? (
          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${
              block.status === 'skipped'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {block.errorMessage}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function GraphView({
  nodes,
  edges,
  graphData,
  loading,
  selectedBlockId,
  selectedBlock,
  availableTags,
  activeTagFilters,
  onToggleTagFilter,
  onClearFilters,
  onSelectNode,
  onJumpToBlock,
}: GraphViewProps) {
  const { language, t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: 960, height: 620 })
  const lastClickRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const tagLookup = useMemo(() => new Map(availableTags.map((tag) => [tag.name, tag])), [availableTags])
  const activeTagSet = useMemo(() => new Set(activeTagFilters), [activeTagFilters])
  const graphInstanceKey = useMemo(
    () => `${activeTagFilters.join('|')}::${nodes.map((node) => node.id).join('|')}`,
    [activeTagFilters, nodes],
  )

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const node of nodes) {
      for (const tagName of new Set(node.tags)) {
        counts.set(tagName, (counts.get(tagName) ?? 0) + 1)
      }
    }

    return counts
  }, [nodes])

  const filterTags = useMemo(() => {
    const merged = new Map<string, TagSuggestion & { count: number }>()

    for (const [tagName, count] of tagCounts.entries()) {
      if (count <= 1) {
        continue
      }

      const baseTag = tagLookup.get(tagName)
      merged.set(tagName, {
        id: baseTag?.id ?? `graph-tag-${tagName}`,
        name: tagName,
        isDefault: baseTag?.isDefault ?? false,
        kind: baseTag?.kind ?? 'detail',
        count,
      })
    }

    for (const tagName of activeTagFilters) {
      if (merged.has(tagName)) {
        continue
      }

      const baseTag = tagLookup.get(tagName)
      merged.set(tagName, {
        id: baseTag?.id ?? `graph-tag-${tagName}`,
        name: tagName,
        isDefault: baseTag?.isDefault ?? false,
        kind: baseTag?.kind ?? 'detail',
        count: tagCounts.get(tagName) ?? 0,
      })
    }

    return Array.from(merged.values())
      .filter((tag) => activeTagSet.has(tag.name) || !SUPPRESSED_FILTER_TAGS.has(tag.name))
      .sort((left, right) => {
        const activeDelta = Number(activeTagSet.has(right.name)) - Number(activeTagSet.has(left.name))
        if (activeDelta !== 0) {
          return activeDelta
        }

        if (left.isDefault !== right.isDefault) {
          return Number(left.isDefault) - Number(right.isDefault)
        }

        const kindRank = { user: 0, detail: 1, category: 2 }
        if (kindRank[left.kind] !== kindRank[right.kind]) {
          return kindRank[left.kind] - kindRank[right.kind]
        }

        if (right.count !== left.count) {
          return right.count - left.count
        }

        return compareText(left.name, right.name)
      })
      .slice(0, 24)
  }, [activeTagFilters, activeTagSet, tagCounts, tagLookup])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const next = {
        width: Math.max(280, Math.round(entry.contentRect.width)),
        height: Math.max(320, Math.round(entry.contentRect.height)),
      }

      setSize((current) => (current.width === next.width && current.height === next.height ? current : next))
    })

    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    setHoveredNodeId(null)
    lastClickRef.current = { id: null, time: 0 }
  }, [graphInstanceKey])

  useEffect(() => {
    if (nodes.length === 0) {
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let fitTimer: ReturnType<typeof setTimeout> | undefined

    const configureGraph = () => {
      if (cancelled) {
        return
      }

      const fg = graphRef.current
      if (!fg) {
        retryTimer = setTimeout(configureGraph, 50)
        return
      }

      fg.d3Force('charge')?.strength?.(-260)
      fg.d3Force('link')?.distance?.((link: { weight?: number }) => 110 - Math.min(50, (link.weight ?? 1) * 10))
      fg.d3ReheatSimulation()

      fitTimer = setTimeout(() => {
        if (!cancelled) {
          fg.zoomToFit(500, Math.max(36, Math.floor(Math.min(size.width, size.height) * 0.06)))
        }
      }, 700)
    }

    configureGraph()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (fitTimer) clearTimeout(fitTimer)
    }
  }, [graphData, nodes.length, size.height, size.width])

  const detailLoading = Boolean(selectedBlockId && !selectedBlock)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[26px] border border-black/[0.06] bg-white shadow-[0_8px_28px_rgba(30,20,10,0.04)]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(19rem,4fr)] xl:grid-cols-[minmax(0,9fr)_minmax(20rem,4fr)] lg:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-black/[0.06] lg:border-b-0 lg:border-r lg:border-black/[0.06]">
          <div className="border-b border-black/[0.06] px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-400">{t('graph.networkTitle')}</p>
                <p className="mt-1 text-sm text-stone-600">{t('graph.networkHint')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span>{t('graph.nodeCount', { count: nodes.length })}</span>
                <span>{t('graph.edgeCount', { count: edges.length })}</span>
                {activeTagFilters.length > 0 ? <span>{t('graph.filterCount', { count: activeTagFilters.length })}</span> : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 bg-stone-50/70">
            <div ref={containerRef} className="h-[22rem] min-h-[22rem] min-w-0 sm:h-[26rem] lg:h-full lg:min-h-0">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">{t('graph.loading')}</div>
              ) : nodes.length === 0 ? (
                <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-7 text-stone-500">
                  {t('graph.empty')}
                </div>
              ) : (
                <ForceGraph2D
                  key={graphInstanceKey}
                  ref={graphRef}
                  width={size.width}
                  height={size.height}
                  graphData={graphData}
                  nodeRelSize={4}
                  backgroundColor="#fafaf9"
                  warmupTicks={24}
                  cooldownTicks={72}
                  nodeLabel={(node) => {
                    const graphNode = node as GraphNode
                    const detail = graphNode.summary?.trim() || graphNode.label
                    const tags = graphNode.tags.slice(0, 4).join(language === 'en' ? ', ' : '、')
                    return tags ? `${detail}\n${t('graph.nodeLabelTags', { tags })}` : detail
                  }}
                  linkLabel={(link) => {
                    const edge = link as GraphEdge
                    return edge.sharedTags.length > 0
                      ? t('graph.sharedTags', { tags: edge.sharedTags.join(language === 'en' ? ', ' : '、') })
                      : ''
                  }}
                  linkColor={(link) => ((link as GraphEdge).weight > 1 ? 'rgba(110,88,56,0.34)' : 'rgba(110,88,56,0.14)')}
                  linkWidth={(link) => Math.min(3.2, 0.8 + ((link as GraphEdge).weight ?? 1) * 0.42)}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const graphNode = node as GraphNode & { x?: number; y?: number }
                    const label = graphNode.label
                    const fontSize = 11 / globalScale
                    const radius = graphNode.size
                    const highlighted = graphNode.id === hoveredNodeId || graphNode.id === selectedBlock?.id
                    const showLabel = highlighted || globalScale >= 1.75
                    const x = graphNode.x ?? 0
                    const y = graphNode.y ?? 0

                    if (highlighted) {
                      ctx.beginPath()
                      ctx.fillStyle = 'rgba(28,25,23,0.08)'
                      ctx.arc(x, y, radius + 4 / globalScale, 0, 2 * Math.PI)
                      ctx.fill()
                    }

                    ctx.beginPath()
                    ctx.fillStyle = graphNode.color
                    ctx.arc(x, y, radius, 0, 2 * Math.PI)
                    ctx.fill()
                    ctx.lineWidth = highlighted ? Math.max(1.5, 2.4 / globalScale) : Math.max(0.7, 1.1 / globalScale)
                    ctx.strokeStyle = highlighted ? '#1f2937' : 'rgba(255,255,255,0.92)'
                    ctx.stroke()

                    if (!showLabel) {
                      return
                    }

                    ctx.font = `${fontSize}px sans-serif`
                    ctx.textAlign = 'center'
                    const textWidth = ctx.measureText(label).width
                    const textX = x
                    const textY = y - radius - 10
                    const horizontalPadding = 6 / globalScale
                    const verticalPadding = 3 / globalScale

                    ctx.fillStyle = 'rgba(255,255,255,0.94)'
                    ctx.fillRect(
                      textX - textWidth / 2 - horizontalPadding,
                      textY - fontSize - verticalPadding,
                      textWidth + horizontalPadding * 2,
                      fontSize + verticalPadding * 2,
                    )

                    ctx.fillStyle = '#2c1f15'
                    ctx.fillText(label, textX, textY)
                  }}
                  onNodeHover={(node) => {
                    const graphNode = node as GraphNode | null
                    setHoveredNodeId(graphNode?.id ?? null)
                  }}
                  onNodeClick={(node) => {
                    const graphNode = node as GraphNode
                    const now = Date.now()

                    if (lastClickRef.current.id === graphNode.id && now - lastClickRef.current.time < 280) {
                      onJumpToBlock(graphNode.id)
                      lastClickRef.current = { id: null, time: 0 }
                      return
                    }

                    lastClickRef.current = { id: graphNode.id, time: now }
                    onSelectNode(graphNode.id)
                  }}
                />
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col bg-white">
          <div className="border-b border-black/[0.06] px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-400">{t('graph.sidebar')}</p>
                <h3 className="mt-1 text-base font-semibold text-stone-900">{t('graph.sidebarTitle')}</h3>
              </div>
              {activeTagFilters.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-200 hover:text-stone-900"
                >
                  {t('graph.clearFilters')}
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
              <span>{t('graph.currentBlocks', { count: nodes.length })}</span>
              <span>{activeTagFilters.length > 0 ? t('graph.filterLocked', { count: activeTagFilters.length }) : t('graph.filterDisabled')}</span>
            </div>
          </div>

          <div className="border-b border-black/[0.06] px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">{t('graph.filterTitle')}</h4>
              <span className="text-xs text-stone-400">{filterTags.length > 0 ? t('graph.availableTags', { count: filterTags.length }) : t('graph.noAvailableTags')}</span>
            </div>

            {filterTags.length > 0 ? (
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1 xl:max-h-48">
                {filterTags.map((tag) => {
                  const active = activeTagFilters.includes(tag.name)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onToggleTagFilter(tag.name)}
                      title={tag.count > 0 ? t('graph.tagNodeCountTitle', { name: tag.name, count: tag.count }) : tag.name}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        active ? 'bg-stone-900 text-white' : 'bg-stone-100/80 text-stone-700 hover:bg-stone-200 hover:text-stone-900'
                      }`}
                    >
                      {tag.name}
                      {tag.count > 0 ? <span className={`ml-1 ${active ? 'text-white/70' : 'text-stone-400'}`}>{tag.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-400">{t('graph.filterEmpty')}</p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">{t('graph.blockDetail')}</h4>
              {selectedBlock ? <span className="text-xs text-stone-400">{t('graph.selectedOneNode')}</span> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <GraphSelectionDetail
                block={selectedBlock}
                loading={detailLoading}
                activeTagFilters={activeTagFilters}
                onToggleTagFilter={onToggleTagFilter}
                onJumpToBlock={onJumpToBlock}
                t={t}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
