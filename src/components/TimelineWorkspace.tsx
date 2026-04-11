import { memo, useEffect, useRef, useState, type ReactNode } from 'react'

import type { Block, NotebookSummary, TagSuggestion } from '../../shared/types'
import type { BlockListChangeHint } from '../lib/blockListCache'
import { formatLocalDateKey } from '../lib/format'
import { buildTimelineDateCountState, reconcileTimelineDateCountState } from '../lib/timelineDerived'
import type { TimelineReviewMode } from '../lib/timelineReview'
import { Timeline } from './Timeline'
import { TimelineSidebar } from './TimelineSidebar'

interface TimelineWorkspaceProps {
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
  blockChangeHint?: BlockListChangeHint
  upcomingDays: number
  onOpenCalendarDate: (dateKey: string) => void
  onOpenReview: (mode: TimelineReviewMode, dateKey: string) => void
}

const TIMELINE_SIDEBAR_BREAKPOINT = 1000

function todayDateKey(): string {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function resolveInitialDateKey(blocks: Block[]): string {
  return blocks[0] ? formatLocalDateKey(blocks[0].createdAt) : todayDateKey()
}

export const TimelineWorkspace = memo(function TimelineWorkspace({
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
  blockChangeHint = { type: 'reset' },
  upcomingDays,
  onOpenCalendarDate,
  onOpenReview,
}: TimelineWorkspaceProps) {
  const previousBlocksRef = useRef<Block[] | null>(null)
  const dateCountStateRef = useRef(buildTimelineDateCountState(blocks))
  const [activeDateKey, setActiveDateKey] = useState(() => resolveInitialDateKey(blocks))
  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= TIMELINE_SIDEBAR_BREAKPOINT,
  )

  if (previousBlocksRef.current !== blocks) {
    dateCountStateRef.current = reconcileTimelineDateCountState(
      previousBlocksRef.current ? dateCountStateRef.current : null,
      blocks,
      blockChangeHint,
    )
    previousBlocksRef.current = blocks
  }

  const latestDateKey = resolveInitialDateKey(blocks)
  const { dateCounts, availableDateKeys } = dateCountStateRef.current

  useEffect(() => {
    if (blocks.length === 0) {
      return
    }

    setActiveDateKey((current) => (current && availableDateKeys.has(current) ? current : latestDateKey))
  }, [availableDateKeys, blocks.length, latestDateKey])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function handleResize(): void {
      setShowSidebar(window.innerWidth >= TIMELINE_SIDEBAR_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Timeline
          blocks={blocks}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          showMiniTimeline={showMiniTimeline}
          composer={composer}
          notebooks={notebooks}
          tagSuggestions={tagSuggestions}
          onSave={onSave}
          onDelete={onDelete}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          onTagClick={onTagClick}
          onLoadMore={onLoadMore}
          onAddToNotebook={onAddToNotebook}
          onCreateNotebookWithBlock={onCreateNotebookWithBlock}
          onFindRelated={onFindRelated}
          focusedBlockId={focusedBlockId}
          onFocusedBlockHandled={onFocusedBlockHandled}
          focusedDateKey={focusedDateKey}
          blockChangeHint={blockChangeHint}
          onActiveDateKeyChange={(dateKey) => {
            if (dateKey) {
              setActiveDateKey(dateKey)
            }
          }}
        />
      </div>

      {showSidebar ? (
        <TimelineSidebar
          dateCounts={dateCounts}
          upcomingDays={upcomingDays}
          activeDateKey={activeDateKey}
          onSelectDate={(dateKey) => {
            setActiveDateKey(dateKey)
            setFocusedDateKey(dateKey)
          }}
          onOpenCalendarDate={onOpenCalendarDate}
          onOpenReview={onOpenReview}
        />
      ) : null}
    </div>
  )
})
