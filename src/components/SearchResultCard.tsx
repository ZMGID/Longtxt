import type { ReactNode } from 'react'

import type { SearchResult } from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { highlightText } from '../lib/highlight'
import { StatusPill } from './StatusPill'

interface SearchResultCardProps {
  result: SearchResult
  query: string
  onTagClick?: (tagName: string) => void
  showScore?: boolean
  metaLabel?: string | null
  footer?: ReactNode
}

export function SearchResultCard({ result, query, onTagClick, showScore = true, metaLabel = null, footer = null }: SearchResultCardProps) {
  const { block } = result

  return (
    <article className="rounded-lg border border-black/[0.06] bg-white/70 p-3 transition-all duration-200 hover:border-black/[0.12] hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <StatusPill status={block.status} />
        <span>{formatTimeLabel(block.updatedAt)}</span>
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {block.aiMode === 'live' ? 'live AI' : 'mock AI'}
        </span>
        {showScore ? (
          <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            得分 {result.score}
          </span>
        ) : metaLabel ? (
          <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            {metaLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">
        {highlightText(block.content, query)}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {block.tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onTagClick?.(tag.name)}
            className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
          >
            {tag.name}
          </button>
        ))}
      </div>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </article>
  )
}
