import type { ReactNode } from 'react'

import type { CalendarDayDetail } from '../../../shared/types'
import { formatCalendarDateLabel } from '../../lib/calendar'
import type { CalendarDetailTab } from './helpers'
import { formatBlockTime } from './helpers'
import { EditableEntryCard } from './EditableEntryCard'
import { SuggestionCard } from './SuggestionCard'

interface CalendarDetailProps {
  selectedDate: string
  dayDetail: CalendarDayDetail | undefined
  isPending: boolean
  detailTab: CalendarDetailTab
  onDetailTabChange: (tab: CalendarDetailTab) => void
  onJumpToBlock: (blockId: string) => Promise<void>
  onRefresh: () => Promise<void>
  autoAcceptAiSuggestions: boolean
  copy: {
    detailEntriesLabel: string
    detailEntriesTitle: string
    detailEntriesEmpty: string
    detailSuggestionsLabel: string
    detailSuggestionsTitleAuto: string
    detailSuggestionsTitle: string
    detailSuggestionsEmptyAuto: string
    detailSuggestionsEmpty: string
    detailBlocksLabel: string
    detailBlocksTitle: string
    detailBlocksEmpty: string
    detailLabel: string
    detailCurrent: string
    detailLoading: string
  }
}

export function CalendarDetail({
  selectedDate,
  dayDetail,
  isPending,
  detailTab,
  onDetailTabChange,
  onJumpToBlock,
  onRefresh,
  autoAcceptAiSuggestions,
  copy,
}: CalendarDetailProps) {
  const detailSections = [
    {
      key: 'entries' as const,
      label: copy.detailEntriesLabel,
      title: copy.detailEntriesTitle,
      count: dayDetail?.entries.length ?? 0,
      emptyText: copy.detailEntriesEmpty,
    },
    {
      key: 'suggestions' as const,
      label: copy.detailSuggestionsLabel,
      title: autoAcceptAiSuggestions ? copy.detailSuggestionsTitleAuto : copy.detailSuggestionsTitle,
      count: dayDetail?.suggestions.length ?? 0,
      emptyText: autoAcceptAiSuggestions ? copy.detailSuggestionsEmptyAuto : copy.detailSuggestionsEmpty,
    },
    {
      key: 'blocks' as const,
      label: copy.detailBlocksLabel,
      title: copy.detailBlocksTitle,
      count: dayDetail?.blocks.length ?? 0,
      emptyText: copy.detailBlocksEmpty,
    },
  ]

  const activeDetailSection = detailSections.find((section) => section.key === detailTab) ?? detailSections[0]

  let detailContent: ReactNode

  if (isPending) {
    detailContent = <p className="text-sm text-stone-400">{copy.detailLoading}</p>
  } else if (detailTab === 'entries') {
    detailContent = dayDetail && dayDetail.entries.length > 0 ? (
      <div className="divide-y divide-stone-200">
        {dayDetail.entries.map((entry) => (
          <EditableEntryCard key={entry.id} entry={entry} onSaved={onRefresh} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  } else if (detailTab === 'suggestions') {
    detailContent = dayDetail && dayDetail.suggestions.length > 0 ? (
      <div className="divide-y divide-stone-200">
        {dayDetail.suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onUpdated={onRefresh} />
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  } else {
    detailContent = dayDetail && dayDetail.blocks.length > 0 ? (
      <div className="divide-y divide-stone-200">
        {dayDetail.blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => {
              void onJumpToBlock(block.id)
            }}
            className="flex w-full flex-col gap-2 py-4 text-left transition first:pt-0 hover:text-stone-950"
          >
            <div className="flex items-center justify-between gap-3 text-xs text-stone-400">
              <span className="font-medium uppercase tracking-[0.18em]">{formatBlockTime(block.createdAt)}</span>
              <span className="min-w-0 truncate">{block.tags.slice(0, 3).map((tag) => tag.name).join(' · ')}</span>
            </div>
            <div className="break-words text-sm font-medium leading-6 text-stone-900">{block.summary || block.content.slice(0, 120)}</div>
            <div className="line-clamp-2 break-words text-sm leading-6 text-stone-500">{block.content}</div>
          </button>
        ))}
      </div>
    ) : (
      <p className="text-sm leading-6 text-stone-500">{activeDetailSection.emptyText}</p>
    )
  }

  return (
    <section className="min-w-0 shrink-0 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">{copy.detailLabel}</p>
          <h3 className="mt-2 break-words text-2xl font-semibold text-stone-900">{formatCalendarDateLabel(selectedDate)}</h3>
        </div>
        <p className="text-sm text-stone-400">{copy.detailCurrent.replace('{{title}}', activeDetailSection.title).replace('{{count}}', `${activeDetailSection.count}`)}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 border-b border-stone-200 pb-3 text-sm">
        {detailSections.map((section) => {
          const active = section.key === detailTab

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onDetailTabChange(section.key)}
              aria-pressed={active}
              className={`border-b pb-1 transition ${active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
            >
              {section.label}
              <span className="ml-2 text-xs text-stone-400">{section.count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 min-w-0">{detailContent}</div>
    </section>
  )
}
