// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { Block, CalendarDayDetail } from '../../shared/types'
import { prepareAiInsightGeneration, prepareDailyReviewGeneration } from '../services/review'

function makeUntitledBlock(): Block {
  return {
    id: 'block-1',
    content: ' \n ',
    summary: null,
    tags: [],
    createdAt: '2026-04-08T09:00:00.000Z',
    updatedAt: '2026-04-08T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
    errorMessage: null,
  }
}

function makeDayDetail(): CalendarDayDetail {
  return {
    date: '2026-04-08',
    blockCount: 1,
    blocks: [makeUntitledBlock()],
    entries: [],
    suggestions: [],
  }
}

describe('review i18n', () => {
  it('uses english untitled previews for daily review generation input', () => {
    const prepared = prepareDailyReviewGeneration({
      date: '2026-04-08',
      dayDetail: makeDayDetail(),
      mode: 'mock',
      language: 'en',
    })

    expect(prepared.input?.blocks[0]?.preview).toBe('Untitled content')
  })

  it('uses english untitled previews for ai insight generation input and digests', () => {
    const prepared = prepareAiInsightGeneration({
      methodId: 'default-insight',
      anchorDate: '2026-04-08',
      dayDetails: [makeDayDetail()],
      mode: 'mock',
      language: 'en',
    })

    expect(prepared.input?.blocks[0]?.preview).toBe('Untitled content')
    expect(prepared.input?.dayDigests[0]?.previews[0]).toBe('Untitled content')
  })
})
