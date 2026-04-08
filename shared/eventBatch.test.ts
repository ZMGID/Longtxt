import { describe, expect, it } from 'vitest'

import { expandBlockChangedEvents } from './eventBatch'
import type { AppEventBatch } from './types'

describe('eventBatch', () => {
  it('hydrates block update events from batch payloads', () => {
    const batch: AppEventBatch = {
      blockChanges: [{ blockId: 'block-1', reason: 'updated' }],
      blockPayloads: {
        'block-1': {
          id: 'block-1',
          content: '更新后的内容',
          summary: null,
          tags: [],
          createdAt: '2026-04-08T00:00:00.000Z',
          updatedAt: '2026-04-08T00:00:00.000Z',
          status: 'ready',
          aiMode: 'mock',
          errorMessage: null,
        },
      },
      notebookChanges: [],
      metaChanges: [],
      calendarChanges: [],
    }

    expect(expandBlockChangedEvents(batch)).toEqual([{
      reason: 'updated',
      block: batch.blockPayloads['block-1'],
    }])
  })

  it('creates a synthetic placeholder block for delete events without payloads', () => {
    const batch: AppEventBatch = {
      blockChanges: [{ blockId: 'block-9', reason: 'deleted' }],
      blockPayloads: {},
      notebookChanges: [],
      metaChanges: [],
      calendarChanges: [],
    }

    expect(expandBlockChangedEvents(batch)).toEqual([{
      reason: 'deleted',
      block: {
        id: 'block-9',
        content: '',
        summary: null,
        tags: [],
        createdAt: '',
        updatedAt: '',
        status: 'ready',
        aiMode: 'mock',
        errorMessage: null,
      },
    }])
  })
})
