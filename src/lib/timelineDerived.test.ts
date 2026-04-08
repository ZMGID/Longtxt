import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import { buildMiniTimelineDerivedState, buildTimelineDateCountState, reconcileMiniTimelineDerivedState, reconcileTimelineDateCountState } from './timelineDerived'

const baseBlocks: Block[] = [
  {
    id: 'block-4',
    content: '4 月 4 日',
    tags: [],
    createdAt: '2026-04-04T04:00:00.000Z',
    updatedAt: '2026-04-04T04:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-3',
    content: '4 月 3 日',
    tags: [],
    createdAt: '2026-04-03T04:00:00.000Z',
    updatedAt: '2026-04-03T04:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-1',
    content: '4 月 2 日晚上',
    tags: [],
    createdAt: '2026-04-02T11:00:00.000Z',
    updatedAt: '2026-04-02T11:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-2',
    content: '4 月 2 日上午',
    tags: [],
    createdAt: '2026-04-02T04:00:00.000Z',
    updatedAt: '2026-04-02T04:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
]

describe('timeline derived helpers', () => {
  it('increments date counts for prepended blocks without rebuilding from all blocks', () => {
    const previousState = buildTimelineDateCountState(baseBlocks.slice(1))
    const nextState = reconcileTimelineDateCountState(previousState, baseBlocks, {
      type: 'prepend',
      blocks: [baseBlocks[0]!],
    })

    expect(nextState.dateCounts.get('2026-04-04')).toBe(1)
    expect(nextState.dateCounts.get('2026-04-03')).toBe(1)
    expect(nextState.dateCounts.get('2026-04-02')).toBe(2)
    expect(Array.from(nextState.availableDateKeys)).toContain('2026-04-04')
  })

  it('keeps date counts unchanged when a block is replaced inside the same day', () => {
    const previousState = buildTimelineDateCountState(baseBlocks)
    const nextState = reconcileTimelineDateCountState(previousState, [
      baseBlocks[0]!,
      {
        ...baseBlocks[1]!,
        content: '4 月 3 日（摘要更新）',
      },
      baseBlocks[2]!,
      baseBlocks[3]!,
    ], {
      type: 'replace',
      block: {
        ...baseBlocks[1]!,
        content: '4 月 3 日（摘要更新）',
      },
      previousBlock: baseBlocks[1]!,
    })

    expect(nextState).toBe(previousState)
  })

  it('prepends mini timeline groups and merges the boundary day when needed', () => {
    const previousBlocks = baseBlocks.slice(2)
    const previousState = buildMiniTimelineDerivedState(previousBlocks)
    const prependedBlocks = [baseBlocks[0]!, baseBlocks[1]!]
    const nextState = reconcileMiniTimelineDerivedState(previousState, baseBlocks, {
      type: 'prepend',
      blocks: prependedBlocks,
    })

    expect(nextState.groups.map((group) => [group.key, group.count, group.startIndex])).toEqual([
      ['2026-04-04', 1, 0],
      ['2026-04-03', 1, 1],
      ['2026-04-02', 2, 2],
    ])
  })

  it('appends older groups at the tail without touching the existing head groups', () => {
    const previousBlocks = baseBlocks.slice(0, 3)
    const previousState = buildMiniTimelineDerivedState(previousBlocks)
    const nextState = reconcileMiniTimelineDerivedState(previousState, baseBlocks, {
      type: 'append',
      blocks: [baseBlocks[3]!],
    })

    expect(nextState.groups.map((group) => [group.key, group.count, group.startIndex])).toEqual([
      ['2026-04-04', 1, 0],
      ['2026-04-03', 1, 1],
      ['2026-04-02', 2, 2],
    ])
  })
})
