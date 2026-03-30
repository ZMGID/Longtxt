import type { SearchResult } from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { highlightText } from '../lib/highlight'
import { StatusPill } from './StatusPill'

interface SearchResultCardProps {
  result: SearchResult
  query: string
  onTagClick?: (tagName: string) => void
}

export function SearchResultCard({ result, query, onTagClick }: SearchResultCardProps) {
  const { block } = result

  return (
    <article className="rounded-lg border border-stone-200 bg-[#faf8f5] p-4 transition hover:border-stone-300">
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <StatusPill status={block.status} />
        <span>{formatTimeLabel(block.updatedAt)}</span>
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {block.aiMode === 'live' ? 'live AI' : 'mock AI'}
        </span>
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          得分 {result.score}
        </span>
      </div>

      <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-stone-800">
        {highlightText(block.content, query)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
    </article>
  )
}
