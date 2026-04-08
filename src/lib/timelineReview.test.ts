import { describe, expect, it } from 'vitest'

import type { Block, CalendarEntry } from '../../shared/types'
import { buildTimelineReviewData, buildTimelineReviewDateRange } from './timelineReview'

function makeBlock(id: string, createdAt: string): Block {
  return {
    id,
    content: `内容 ${id}`,
    summary: null,
    tags: [],
    createdAt,
    updatedAt: createdAt,
    status: 'ready',
    aiMode: 'mock',
    errorMessage: null,
  }
}

function makeEntry(id: string, date: string, status: CalendarEntry['status']): CalendarEntry {
  return {
    id,
    title: id,
    notes: null,
    date,
    startTime: null,
    allDay: true,
    status,
    source: 'manual',
    linkedBlockId: null,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

describe('timelineReview helpers', () => {
  it('builds a stable 14-day review date range ending at the anchor date', () => {
    const dates = buildTimelineReviewDateRange('2026-04-08')

    expect(dates).toHaveLength(14)
    expect(dates[0]).toBe('2026-03-26')
    expect(dates.at(-1)).toBe('2026-04-08')
  })

  it('counts calendar entries only inside the active 7-day review window', () => {
    const review = buildTimelineReviewData(
      [
        makeBlock('block-1', '2026-04-08T09:00:00.000Z'),
        makeBlock('block-2', '2026-04-03T09:00:00.000Z'),
      ],
      [
        makeEntry('entry-selected', '2026-04-08', 'planned'),
        makeEntry('entry-window-done', '2026-04-05', 'done'),
        makeEntry('entry-previous-window', '2026-03-30', 'done'),
        makeEntry('entry-future-window', '2026-04-12', 'planned'),
      ],
      '2026-04-08',
    )

    expect(review.selectedDayEntries).toHaveLength(1)
    expect(review.reviewWindowEntries).toHaveLength(2)
    expect(review.reviewWindowPlannedCount).toBe(1)
    expect(review.reviewWindowDoneCount).toBe(1)
  })
})
