import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'

import type { Block, GraphEdge, GraphNode, TagSuggestion } from '../../shared/types'
import { BlockCard } from './BlockCard'

interface GraphViewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  loading: boolean
  selectedBlock: Block | null
  availableTags: TagSuggestion[]
  activeTagFilters: string[]
  onToggleTagFilter: (tagName: string) => void
  onSelectNode: (blockId: string) => void
  onJumpToBlock: (blockId: string) => void
}

export function GraphView({
  nodes,
  edges,
  loading,
  selectedBlock,
  availableTags,
  activeTagFilters,
  onToggleTagFilter,
  onSelectNode,
  onJumpToBlock,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: 960, height: 620 })
  const lastClickRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

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

      setSize({
        width: entry.contentRect.width,
        height: Math.max(640, entry.contentRect.height),
      })
    })

    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [])

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: edges.map((edge) => ({ ...edge })),
    }),
    [nodes, edges],
  )

  // 跟踪是否已对当前数据集执行过自动适配，避免重复触发
  const hasFittedRef = useRef(false)

  // 数据变化时重置标记
  useEffect(() => {
    hasFittedRef.current = false
  }, [graphData])

  // 配置力参数 + 自动适配视口
  // 用 polling 等待 ForceGraph2D 挂载（graphRef 可用），而非依赖 graphData 变化时序
  useEffect(() => {
    if (nodes.length === 0 || hasFittedRef.current) {
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = () => {
      if (cancelled) return
      const fg = graphRef.current
      if (!fg) {
        // ref 还没就绪（ForceGraph2D 尚未挂载），50ms 后重试
        setTimeout(poll, 50)
        return
      }

      fg.d3Force('charge')?.strength?.(-260)
      fg.d3Force('link')?.distance?.((link: { weight?: number }) => 110 - Math.min(50, (link.weight ?? 1) * 10))

      hasFittedRef.current = true

      // 80 ticks 约需 1.3s，留余量等模拟稳定后自动适配视口
      timer = setTimeout(() => {
        if (!cancelled) {
          fg.zoomToFit(600, 50)
        }
      }, 1800)
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [graphData, nodes.length])

  return (
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="rounded-lg border border-stone-200 bg-white/70 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">标签筛选</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">节点代表块，边代表共享标签关系。点击节点看详情，双击跳回时间轴。</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {availableTags.slice(0, 24).map((tag) => {
            const active = activeTagFilters.includes(tag.name)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTagFilter(tag.name)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  active ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="rounded-lg border border-stone-200 bg-white/70 p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-400">连接图</p>
          <div className="flex gap-2">
            <span className="text-xs text-stone-400">{nodes.length} 个节点</span>
            <span className="text-xs text-stone-400">{edges.length} 条边</span>
          </div>
        </div>

        <div ref={containerRef} className="h-[600px] overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-stone-500">正在构建连接图…</div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-7 text-stone-500">
              当前筛选下没有可显示的块关联。试试清空标签筛选，或先积累更多带标签的块。
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              width={size.width}
              height={size.height}
              graphData={graphData}
              nodeRelSize={4}
              backgroundColor="#f8fafc"
              cooldownTicks={80}
              linkColor={(link) => ((link as GraphEdge).weight > 1 ? 'rgba(110,88,56,0.34)' : 'rgba(110,88,56,0.16)')}
              linkWidth={(link) => Math.min(4, 1 + ((link as GraphEdge).weight ?? 1) * 0.6)}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const graphNode = node as GraphNode & { x?: number; y?: number }
                const label = graphNode.label
                const fontSize = 12 / globalScale
                const radius = graphNode.size
                const showLabel = globalScale >= 0.85 || graphNode.id === hoveredNodeId || graphNode.id === selectedBlock?.id

                ctx.beginPath()
                ctx.fillStyle = graphNode.color
                ctx.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius, 0, 2 * Math.PI)
                ctx.fill()

                if (!showLabel) {
                  return
                }

                ctx.font = `${fontSize}px sans-serif`
                ctx.fillStyle = '#2c1f15'
                ctx.textAlign = 'center'
                ctx.fillText(label, graphNode.x ?? 0, (graphNode.y ?? 0) - radius - 8)
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
      </section>

      <aside className="rounded-lg border border-stone-200 bg-white/70 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">块详情</p>

        <div className="mt-3">
          {selectedBlock ? (
            <BlockCard block={selectedBlock} editable={false} compact />
          ) : (
            <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-sm leading-7 text-stone-400">
              点击连接图中的节点查看块详情；双击节点会跳回时间轴并定位到该块。
            </div>
          )}
        </div>
      </aside>
    </section>
  )
}
