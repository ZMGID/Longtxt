import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

import type { Block, NotebookSummary, TagSuggestion } from '../../shared/types'
import type { BlockListChangeHint } from '../lib/blockListCache'
import { getActiveMiniTimelineGroupKey } from '../lib/miniTimeline'
import { formatDateKeyLabel, formatLocalDateKey } from '../lib/format'
import { buildMiniTimelineDerivedState, reconcileMiniTimelineDerivedState } from '../lib/timelineDerived'
import { AddToNotebookMenu } from './AddToNotebookMenu'
import { BlockCard } from './BlockCard'

interface TimelineProps {
  blocks: Block[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  showMiniTimeline: boolean
  composer?: ReactNode
  notebooks?: NotebookSummary[]
  tagSuggestions: TagSuggestion[]
  onSave: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddTag: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag: (blockId: string, tagId: string) => Promise<void>
  onTagClick: (tagName: string) => void
  onLoadMore: () => Promise<void>
  onAddToNotebook?: (notebookId: string, blockId: string) => Promise<void>
  onCreateNotebookWithBlock?: (blockId: string) => Promise<void>
  onFindRelated?: (blockId: string) => void
  focusedBlockId?: string | null
  onFocusedBlockHandled?: () => void
  focusedDateKey?: string | null
  onActiveDateKeyChange?: (dateKey: string | null) => void
  blockChangeHint?: BlockListChangeHint
}

const MINI_TIMELINE_COLLAPSE_BREAKPOINT = 700

export function Timeline({
  blocks,
  loading,
  loadingMore,
  hasMore,
  showMiniTimeline,
  composer,
  notebooks = [],
  tagSuggestions,
  onSave,
  onDelete,
  onAddTag,
  onRemoveTag,
  onTagClick,
  onLoadMore,
  onAddToNotebook,
  onCreateNotebookWithBlock,
  onFindRelated,
  focusedBlockId,
  onFocusedBlockHandled,
  focusedDateKey,
  onActiveDateKeyChange,
  blockChangeHint = { type: 'reset' },
}: TimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const previousBlocksRef = useRef<Block[] | null>(null)
  const miniTimelineStateRef = useRef(buildMiniTimelineDerivedState(blocks))
  const [topVisibleIndex, setTopVisibleIndex] = useState(0)
  const [allowMiniTimeline, setAllowMiniTimeline] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= MINI_TIMELINE_COLLAPSE_BREAKPOINT,
  )

  if (previousBlocksRef.current !== blocks) {
    miniTimelineStateRef.current = reconcileMiniTimelineDerivedState(
      previousBlocksRef.current ? miniTimelineStateRef.current : null,
      blocks,
      blockChangeHint,
    )
    previousBlocksRef.current = blocks
  }

  const miniTimelineState = miniTimelineStateRef.current
  const boundedTopVisibleIndex = Math.min(topVisibleIndex, Math.max(0, blocks.length - 1))
  const miniTimelineGroups = miniTimelineState.groups
  const shouldShowMiniTimeline = showMiniTimeline && allowMiniTimeline
  const activeMiniTimelineGroupKey = getActiveMiniTimelineGroupKey(miniTimelineGroups, boundedTopVisibleIndex)
  const miniTimelineGroupByStartIndex = miniTimelineState.groupByStartIndex

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function handleResize(): void {
      setAllowMiniTimeline(window.innerWidth >= MINI_TIMELINE_COLLAPSE_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (!focusedBlockId) {
      return
    }

    const index = blocks.findIndex((block) => block.id === focusedBlockId)

    if (index === -1) {
      return
    }

    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'auto' })
    onFocusedBlockHandled?.()
  }, [blocks, focusedBlockId, onFocusedBlockHandled])

  useEffect(() => {
    onActiveDateKeyChange?.(activeMiniTimelineGroupKey)
  }, [activeMiniTimelineGroupKey, onActiveDateKeyChange])

  useEffect(() => {
    if (!focusedDateKey) {
      return
    }

    const index = blocks.findIndex((block) => formatLocalDateKey(block.createdAt) === focusedDateKey)

    if (index === -1) {
      return
    }

    virtuosoRef.current?.scrollToIndex({ index, align: 'start', behavior: 'auto' })
  }, [blocks, focusedDateKey])

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-stone-200 bg-white/70">
        <p className="text-sm text-stone-400">加载中…</p>
      </div>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        {composer ? composer : null}
        <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-stone-200 bg-white/70">
          <p className="text-sm text-stone-400">还没有块，从上面开始写吧。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {composer ? composer : null}

      <div className="flex min-h-0 flex-1 gap-3">
        {shouldShowMiniTimeline ? (
          <aside
            data-testid="mini-timeline"
            className="flex w-[40px] shrink-0 py-2"
          >
            <div className="relative flex-1">
              <div className="absolute bottom-2 right-[9px] top-2 w-px bg-stone-200/75" />
              {miniTimelineGroups.map((group) => {
                const active = group.key === activeMiniTimelineGroupKey
                const topPercent = miniTimelineGroups.length === 1 ? 50 : 8 + group.positionRatio * 84

                return (
                  <div
                    key={group.key}
                    className="absolute left-0 right-0 -translate-y-1/2"
                    style={{ top: `${topPercent}%` }}
                  >
                    <div className="flex items-center justify-end gap-1 pr-[5px]">
                      {active ? (
                        <span
                          className="text-[9px] font-medium leading-none tracking-[0.08em] text-stone-500"
                          style={{
                            writingMode: 'vertical-rl',
                            textOrientation: 'upright',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {group.label}
                        </span>
                      ) : null}
                      <span
                        title={group.title}
                        className={`block rounded-full transition ${
                          active
                            ? 'h-2.5 w-2.5 bg-stone-900 shadow-[0_0_0_3px_rgba(28,25,23,0.1)]'
                            : 'h-2 w-2 border border-stone-300 bg-white/90'
                        }`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        ) : null}

        <Virtuoso
          ref={virtuosoRef}
          style={{ flex: 1, minHeight: 0 }}
          data={blocks}
          rangeChanged={(range) => {
            setTopVisibleIndex(range.startIndex)
          }}
          itemContent={(index, block) => (
            <div className="pb-2">
              {miniTimelineGroupByStartIndex.get(index) ? (
                <div className="mb-2 border-b border-stone-200 pb-2 pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">日期</div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">
                    {formatDateKeyLabel(miniTimelineGroupByStartIndex.get(index)!.key, { weekday: true })}
                  </div>
                </div>
              ) : null}
              <BlockCard
                key={block.id}
                block={block}
                headerActions={
                  onAddToNotebook && onCreateNotebookWithBlock ? (
                    <AddToNotebookMenu
                      blockId={block.id}
                      notebooks={notebooks}
                      onAddToNotebook={onAddToNotebook}
                      onCreateNotebookWithBlock={onCreateNotebookWithBlock}
                    />
                  ) : null
                }
                tagSuggestions={tagSuggestions}
                onSave={onSave}
                onDelete={onDelete}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                onTagClick={onTagClick}
                onFindRelated={onFindRelated}
              />
            </div>
          )}
          components={{
            Footer: () =>
              hasMore ? (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={() => void onLoadMore()}
                    disabled={loadingMore}
                    className="rounded border border-stone-200 bg-white/70 px-4 py-2 text-sm text-stone-600 transition duration-150 hover:bg-stone-50 active:scale-[0.97] disabled:opacity-50"
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </button>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-stone-400">已显示全部块</div>
              ),
          }}
        />
      </div>
    </div>
  )
}
