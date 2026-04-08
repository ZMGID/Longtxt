import { useMemo } from 'react'

import type { Block, CalendarEntry } from '../../shared/types'
import { formatDateKeyLabel } from '../lib/format'
import {
  REVIEW_MODES,
  buildTimelineReviewData,
  extractBlockPreview,
  formatDeltaLabel,
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
  const reviewData = useMemo(
    () => buildTimelineReviewData(blocks, entries, anchorDateKey),
    [anchorDateKey, blocks, entries],
  )

  return (
    <section className="min-w-0 flex-1 overflow-y-auto">
      <div className="border-b border-stone-200 pb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">时间轴回顾</div>
        <h3 className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-stone-900">
          {REVIEW_MODES.find((mode) => mode.id === activeMode)?.label ?? '回顾'}
        </h3>
      </div>

      {loading ? (
        <div className="py-6 text-sm text-stone-400">正在整理回顾内容…</div>
      ) : null}

      {error ? (
        <div className="py-6 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error && activeMode === 'daily-review' ? (
        <div className="divide-y divide-stone-200">
          <div className="py-4">
            <div className="text-sm font-medium text-stone-900">{formatDateKeyLabel(anchorDateKey, { weekday: true })}</div>
            <div className="mt-1 text-sm leading-6 text-stone-500">
              {reviewData.selectedDayBlocks.length} 个块 · {reviewData.selectedDayEntries.filter((entry) => entry.status === 'planned').length} 项安排 · {reviewData.selectedDayEntries.filter((entry) => entry.status === 'done').length} 项完成
            </div>
          </div>

          <div className="py-4">
            <div className="text-sm text-stone-500">当天主题</div>
            <div className="mt-1 text-sm leading-6 text-stone-900">
              {reviewData.selectedDayTags.length > 0
                ? reviewData.selectedDayTags.map((tag) => `#${tag.name}`).join(' · ')
                : '这一天还没有形成明显主题'}
            </div>
          </div>

          <div className="py-4">
            <div className="text-sm text-stone-500">当天内容</div>
            <div className="mt-2 divide-y divide-stone-200">
              {reviewData.selectedDayBlocks.length > 0 ? (
                reviewData.selectedDayBlocks.slice(0, 5).map((block) => (
                  <div key={block.id} className="py-2 first:pt-0">
                    <div className="line-clamp-2 text-sm leading-6 text-stone-800">{extractBlockPreview(block)}</div>
                  </div>
                ))
              ) : (
                <div className="py-2 text-sm leading-6 text-stone-500">这一天还没有块，等你写完之后这里会自动整理当天内容。</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && activeMode === 'ai-insights' ? (
        <div className="divide-y divide-stone-200">
          <MetaRow label="最近 7 天" value={`${reviewData.reviewWindowBlocks.length} 个块`} />
          <MetaRow
            label="写入节奏"
            value={formatDeltaLabel(reviewData.reviewWindowBlocks.length - reviewData.previousWindowBlocks.length)}
          />
          <MetaRow
            label="最活跃日期"
            value={reviewData.busiestReviewDay ? `${reviewData.busiestReviewDay.dateKey.slice(5).replace('-', '/')} · ${reviewData.busiestReviewDay.count} 个块` : '暂无'}
          />
          <div className="py-4">
            <div className="text-sm text-stone-500">高频主题</div>
            <div className="mt-1 text-sm leading-6 text-stone-900">
              {reviewData.reviewWindowTags.length > 0
                ? reviewData.reviewWindowTags.slice(0, 4).map((tag) => `#${tag.name}`).join(' · ')
                : '最近 7 天还没有明显主题'}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && activeMode === 'recent-shifts' ? (
        <div className="divide-y divide-stone-200">
          <MetaRow
            label="当前窗口"
            value={`${reviewData.reviewWindowStart.slice(5).replace('-', '/')} - ${anchorDateKey.slice(5).replace('-', '/')}`}
          />
          <MetaRow label="窗口安排" value={`${reviewData.reviewWindowPlannedCount} 项`} />
          <MetaRow label="窗口完成" value={`${reviewData.reviewWindowDoneCount} 项`} />
          <div className="py-4">
            <div className="text-sm text-stone-500">阶段变化</div>
            <div className="mt-1 text-sm leading-7 text-stone-800">
              {reviewData.reviewWindowBlocks.length > 0
                ? `这一段时间里共写入 ${reviewData.reviewWindowBlocks.length} 个块，${reviewData.reviewWindowTags.length > 0 ? `主题主要集中在 ${reviewData.reviewWindowTags.slice(0, 3).map((tag) => tag.name).join('、')}。` : '还没有形成稳定主题。'}`
                : '这一段时间里还没有新的块。'}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
