import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

import type { Block, TagSuggestion } from '../../shared/types'
import { BlockCard } from './BlockCard'

interface TimelineProps {
  blocks: Block[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  composer?: ReactNode
  tagSuggestions: TagSuggestion[]
  onSave: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddTag: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag: (blockId: string, tagId: string) => Promise<void>
  onTagClick: (tagName: string) => void
  onLoadMore: () => Promise<void>
  focusedBlockId?: string | null
  onFocusedBlockHandled?: () => void
}

export function Timeline({
  blocks,
  loading,
  loadingMore,
  hasMore,
  composer,
  tagSuggestions,
  onSave,
  onDelete,
  onAddTag,
  onRemoveTag,
  onTagClick,
  onLoadMore,
  focusedBlockId,
  onFocusedBlockHandled,
}: TimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)

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

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-stone-200 bg-[#faf8f5]">
        <p className="text-sm text-stone-400">加载中…</p>
      </div>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-3">
        {composer ? composer : null}
        <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-stone-200 bg-[#faf8f5]">
          <p className="text-sm text-stone-400">还没有块，从上面开始写吧。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {composer ? composer : null}

      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '75vh' }}
        data={blocks}
        itemContent={(_index, block) => (
          <div className="pb-3">
            <BlockCard
              key={block.id}
              block={block}
              tagSuggestions={tagSuggestions}
              onSave={onSave}
              onDelete={onDelete}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onTagClick={onTagClick}
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
                  className="rounded border border-stone-200 bg-[#faf8f5] px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
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
  )
}
