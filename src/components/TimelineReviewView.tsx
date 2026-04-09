import { useMemo } from 'react'

import type { Block, CalendarEntry } from '../../shared/types'
import { useI18n } from '../i18n/useI18n'
import { formatDateKeyLabel } from '../lib/format'
import {
  REVIEW_MODES,
  buildTimelineReviewData,
  extractBlockPreview,
  formatDeltaLabel,
  getTimelineReviewModeLabel,
  type TimelineReviewMode,
} from '../lib/timelineReview'

interface TimelineReviewViewProps {
  blocks: Block[]
  entries: CalendarEntry[]
  anchorDateKey: string
  activeMode: TimelineReviewMode
  loading?: boolean
  error?: string | null
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-right text-sm font-medium text-stone-900">{value}</span>
    </div>
  )
}

export function TimelineReviewView({
  blocks,
  entries,
  anchorDateKey,
  activeMode,
  loading = false,
  error = null,
}: TimelineReviewViewProps) {
  const { language, t } = useI18n()
  const reviewData = useMemo(
    () => buildTimelineReviewData(blocks, entries, anchorDateKey),
    [anchorDateKey, blocks, entries],
  )
  const activeModeTitle = getTimelineReviewModeLabel(activeMode, language)
  const dailySummary = language === 'en'
    ? `${reviewData.selectedDayBlocks.length} blocks · ${reviewData.selectedDayEntries.filter((entry) => entry.status === 'planned').length} planned · ${reviewData.selectedDayEntries.filter((entry) => entry.status === 'done').length} done`
    : `${reviewData.selectedDayBlocks.length} 个块 · ${reviewData.selectedDayEntries.filter((entry) => entry.status === 'planned').length} 项安排 · ${reviewData.selectedDayEntries.filter((entry) => entry.status === 'done').length} 项完成`
  const busiestDayLabel = reviewData.busiestReviewDay
    ? (language === 'en'
      ? `${reviewData.busiestReviewDay.dateKey.slice(5).replace('-', '/')} · ${reviewData.busiestReviewDay.count} blocks`
      : `${reviewData.busiestReviewDay.dateKey.slice(5).replace('-', '/')} · ${reviewData.busiestReviewDay.count} 个块`)
    : t('timelineReview.ai.none')
  const recentWindowLabel = language === 'en'
    ? `${reviewData.reviewWindowStart.slice(5).replace('-', '/')} - ${anchorDateKey.slice(5).replace('-', '/')}`
    : `${reviewData.reviewWindowStart.slice(5).replace('-', '/')} - ${anchorDateKey.slice(5).replace('-', '/')}`
  const recentShiftSummary = reviewData.reviewWindowBlocks.length > 0
    ? (language === 'en'
      ? `You wrote ${reviewData.reviewWindowBlocks.length} blocks in this window. ${reviewData.reviewWindowTags.length > 0 ? `Themes mostly center on ${reviewData.reviewWindowTags.slice(0, 3).map((tag) => tag.name).join(', ')}.` : 'No stable theme has formed yet.'}`
      : `这一段时间里共写入 ${reviewData.reviewWindowBlocks.length} 个块，${reviewData.reviewWindowTags.length > 0 ? `主题主要集中在 ${reviewData.reviewWindowTags.slice(0, 3).map((tag) => tag.name).join('、')}。` : '还没有形成稳定主题。'}`)
    : (language === 'en' ? 'No new blocks in this window yet.' : '这一段时间里还没有新的块。')

  return (
    <section className="min-w-0 flex-1 overflow-y-auto">
      <div className="border-b border-stone-200 pb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('timelineReview.title')}</div>
        <h3 className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-stone-900">
          {REVIEW_MODES.includes(activeMode) ? activeModeTitle : t('timelineReview.defaultTitle')}
        </h3>
      </div>

      {loading ? (
        <div className="py-6 text-sm text-stone-400">{t('timelineReview.loading')}</div>
      ) : null}

      {error ? (
        <div className="py-6 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error && activeMode === 'daily-review' ? (
        <div className="divide-y divide-stone-200">
          <div className="py-4">
            <div className="text-sm font-medium text-stone-900">{formatDateKeyLabel(anchorDateKey, { weekday: true })}</div>
            <div className="mt-1 text-sm leading-6 text-stone-500">{dailySummary}</div>
          </div>

          <div className="py-4">
            <div className="text-sm text-stone-500">{t('timelineReview.daily.tags')}</div>
            <div className="mt-1 text-sm leading-6 text-stone-900">
              {reviewData.selectedDayTags.length > 0
                ? reviewData.selectedDayTags.map((tag) => `#${tag.name}`).join(' · ')
                : t('timelineReview.daily.tagsEmpty')}
            </div>
          </div>

          <div className="py-4">
            <div className="text-sm text-stone-500">{t('timelineReview.daily.blocks')}</div>
            <div className="mt-2 divide-y divide-stone-200">
              {reviewData.selectedDayBlocks.length > 0 ? (
                reviewData.selectedDayBlocks.slice(0, 5).map((block) => (
                  <div key={block.id} className="py-2 first:pt-0">
                    <div className="line-clamp-2 text-sm leading-6 text-stone-800">{extractBlockPreview(block, language)}</div>
                  </div>
                ))
              ) : (
                <div className="py-2 text-sm leading-6 text-stone-500">{t('timelineReview.daily.blocksEmpty')}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && activeMode === 'ai-insights' ? (
        <div className="divide-y divide-stone-200">
          <MetaRow label={t('timelineReview.ai.window')} value={language === 'en' ? `${reviewData.reviewWindowBlocks.length} blocks` : `${reviewData.reviewWindowBlocks.length} 个块`} />
          <MetaRow
            label={t('timelineReview.ai.pace')}
            value={formatDeltaLabel(reviewData.reviewWindowBlocks.length - reviewData.previousWindowBlocks.length, language)}
          />
          <MetaRow
            label={t('timelineReview.ai.busiest')}
            value={busiestDayLabel}
          />
          <div className="py-4">
            <div className="text-sm text-stone-500">{t('timelineReview.ai.topTags')}</div>
            <div className="mt-1 text-sm leading-6 text-stone-900">
              {reviewData.reviewWindowTags.length > 0
                ? reviewData.reviewWindowTags.slice(0, 4).map((tag) => `#${tag.name}`).join(' · ')
                : t('timelineReview.ai.topTagsEmpty')}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && activeMode === 'recent-shifts' ? (
        <div className="divide-y divide-stone-200">
          <MetaRow
            label={t('timelineReview.recent.window')}
            value={recentWindowLabel}
          />
          <MetaRow label={t('timelineReview.recent.planned')} value={language === 'en' ? `${reviewData.reviewWindowPlannedCount} items` : `${reviewData.reviewWindowPlannedCount} 项`} />
          <MetaRow label={t('timelineReview.recent.done')} value={language === 'en' ? `${reviewData.reviewWindowDoneCount} items` : `${reviewData.reviewWindowDoneCount} 项`} />
          <div className="py-4">
            <div className="text-sm text-stone-500">{t('timelineReview.recent.shifts')}</div>
            <div className="mt-1 text-sm leading-7 text-stone-800">{recentShiftSummary}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
