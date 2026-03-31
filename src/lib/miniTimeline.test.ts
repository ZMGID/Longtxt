import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import { buildMiniTimelineGroups, getActiveMiniTimelineGroupKey } from './miniTimeline'

const sampleBlocks: Block[] = [
  {
    id: 'block-1',
    content: '第一条',
    tags: [],
    createdAt: '2026-03-31T10:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-2',
    content: '第二条',
    tags: [],
    createdAt: '2026-03-31T08:00:00.000Z',
    updatedAt: '2026-03-31T08:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-3',
    content: '第三条',
    tags: [],
    createdAt: '2026-03-30T08:00:00.000Z',
    updatedAt: '2026-03-30T08:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
]

describe('mini timeline helpers', () => {
  it('groups adjacent blocks by created date', () => {
    const groups = buildMiniTimelineGroups(sampleBlocks)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      key: '2026-03-31',
      count: 2,
      startIndex: 0,
    })
    expect(groups[1]).toMatchObject({
      key: '2026-03-30',
      count: 1,
      startIndex: 2,
    })
  })

  it('returns the active date group based on the top visible block index', () => {
    const groups = buildMiniTimelineGroups(sampleBlocks)

    expect(getActiveMiniTimelineGroupKey(groups, 0)).toBe('2026-03-31')
    expect(getActiveMiniTimelineGroupKey(groups, 1)).toBe('2026-03-31')
    expect(getActiveMiniTimelineGroupKey(groups, 2)).toBe('2026-03-30')
  })
})
