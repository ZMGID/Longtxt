import type { ReactNode } from 'react'

import type { MatchSource, SearchResult, TagSuggestion } from '../../shared/types'
import { buildSearchPreview } from '../../shared/searchPreview'
import { useI18n } from '../i18n/useI18n'
import { formatTimeLabel } from '../lib/format'
import { highlightText } from '../lib/highlight'
import { BlockCard } from './BlockCard'
import { StatusPill } from './StatusPill'

interface SearchResultCardProps {
  result: SearchResult
  query: string
  editable?: boolean
  tagSuggestions?: TagSuggestion[]
  onTagClick?: (tagName: string) => void
  onSave?: (id: string, content: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onAddTag?: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag?: (blockId: string, tagId: string) => Promise<void>
  onFindRelated?: (blockId: string) => void
  showScore?: boolean
  metaLabel?: string | null
  headerActions?: ReactNode
  footer?: ReactNode
}

export function SearchResultCard({
  result,
  query,
  editable = false,
  tagSuggestions = [],
  onTagClick,
  onSave,
  onDelete,
  onAddTag,
  onRemoveTag,
  onFindRelated,
  showScore = true,
  metaLabel = null,
  headerActions = null,
  footer = null,
}: SearchResultCardProps) {
  const { t } = useI18n()
  const { block } = result
  const matchSourceLabels: Record<MatchSource, string> = {
    tag: t('searchResult.match.tag'),
    fts: t('searchResult.match.fts'),
    vector: t('searchResult.match.vector'),
  }
  const previewText = result.preview ?? buildSearchPreview(block.content, query)
  const previewContent = (
    <div className="whitespace-pre-wrap break-words">
      {highlightText(previewText, query)}
    </div>
  )
  const metaBadges = (
    <>
      {showScore ? (
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {t('searchResult.score', { score: result.score })}
        </span>
      ) : metaLabel ? (
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {metaLabel}
        </span>
      ) : null}
      {result.matchSource.map((source) => (
        <span key={source} className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
          {matchSourceLabels[source]}
        </span>
      ))}
    </>
  )

  if (editable) {
    return (
      <BlockCard
        block={block}
        editable
        contentOverride={previewContent}
        metaBadges={metaBadges}
        headerActions={headerActions}
        footer={footer}
        tagSuggestions={tagSuggestions}
        onSave={onSave}
        onDelete={onDelete}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onTagClick={onTagClick}
        onFindRelated={onFindRelated}
      />
    )
  }

  return (
    <article className="rounded-lg border border-black/[0.06] bg-white/70 p-3 transition-all duration-200 hover:border-black/[0.12] hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-stone-500">
          <StatusPill status={block.status} />
          <span>{formatTimeLabel(block.updatedAt)}</span>
          <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            {block.aiMode === 'live' ? 'live AI' : 'mock AI'}
          </span>
          {metaBadges}
        </div>

        {headerActions ? (
          <div className="shrink-0">
            {headerActions}
          </div>
        ) : null}
      </div>

      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">
        {previewContent}
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
