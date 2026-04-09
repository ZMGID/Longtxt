import { describe, expect, it } from 'vitest'

import { QueryClient } from '@tanstack/react-query'

import type { Block, BlockChangedEvent, CalendarDayDetail } from '../../shared/types'
import { queryKeys } from './queryKeys'
import {
  applyBlockChangedEventsToCalendarDayDetail,
  applyBlockChangedEventsToDateBlocks,
  collectReviewQueryKeysToInvalidate,
  getBlockEventInvalidationImpact,
} from './blockEventQueryRouting'

function createBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: overrides.id ?? 'block-1',
    content: overrides.content ?? '默认内容',
    summary: overrides.summary ?? null,
    imageAnnotations: overrides.imageAnnotations ?? [],
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T09:00:00.000Z',
    status: overrides.status ?? 'ready',
    aiMode: overrides.aiMode ?? 'mock',
    errorMessage: overrides.errorMessage ?? null,
  }
}

describe('blockEventQueryRouting', () => {
  it('patches per-day block arrays from block events without refetching', () => {
    const existing = createBlock({ id: 'block-existing', createdAt: '2026-04-01T09:00:00.000Z' })
    const updated = createBlock({ id: 'block-existing', summary: '更新后的摘要', createdAt: '2026-04-01T09:00:00.000Z' })
    const created = createBlock({ id: 'block-created', createdAt: '2026-04-01T12:00:00.000Z' })
    const deleted = createBlock({ id: 'block-delete', createdAt: '2026-04-01T08:00:00.000Z' })

    const nextBlocks = applyBlockChangedEventsToDateBlocks(
      [existing, deleted],
      [
        { reason: 'updated', block: updated },
        { reason: 'created', block: created },
        { reason: 'deleted', block: deleted },
      ] satisfies BlockChangedEvent[],
      '2026-04-01',
    )

    expect(nextBlocks.map((block) => block.id)).toEqual(['block-created', 'block-existing'])
    expect(nextBlocks[1]?.summary).toBe('更新后的摘要')
  })

  it('patches cached calendar day detail blocks and blockCount', () => {
    const initialDetail: CalendarDayDetail = {
      date: '2026-04-01',
      blockCount: 1,
      blocks: [createBlock({ id: 'block-1', createdAt: '2026-04-01T09:00:00.000Z' })],
      entries: [],
      suggestions: [],
    }

    const nextDetail = applyBlockChangedEventsToCalendarDayDetail(initialDetail, [
      {
        reason: 'tagged',
        block: createBlock({
          id: 'block-1',
          tags: [{ id: 'tag-1', name: '新标签', isDefault: false, source: 'manual', kind: 'user' }],
        }),
      },
      {
        reason: 'created',
        block: createBlock({ id: 'block-2', createdAt: '2026-04-01T12:00:00.000Z' }),
      },
    ])

    expect(nextDetail.blockCount).toBe(2)
    expect(nextDetail.blocks[0]?.id).toBe('block-2')
    expect(nextDetail.blocks[1]?.tags.map((tag) => tag.name)).toEqual(['新标签'])
  })

  it('builds invalidation impact from block events', () => {
    const impact = getBlockEventInvalidationImpact([
      { reason: 'created', block: createBlock({ createdAt: '2026-04-01T09:00:00.000Z' }) },
      { reason: 'enriched', block: createBlock({ id: 'block-2', createdAt: '2026-04-02T09:00:00.000Z' }) },
    ])

    expect(impact.invalidateGraph).toBe(true)
    expect(impact.invalidateTags).toBe(true)
    expect(impact.invalidateDataManagement).toBe(true)
    expect(impact.invalidateBlockCleanupDays).toBe(true)
    expect(impact.invalidateCalendarYears).toBe(true)
    expect(impact.heatmapYears).toEqual([2026])
    expect(impact.reviewDates).toEqual(['2026-04-01', '2026-04-02'])
  })

  it('collects only affected daily and insight review query keys', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const dailyAffected = queryKeys.reviewDaily('zh', '2026-04-01', 0)
    const dailyUnaffected = queryKeys.reviewDaily('zh', '2026-04-20', 0)
    const insightAffected = queryKeys.reviewInsight('zh', 'default-insight', '2026-04-14', 0)
    const insightUnaffected = queryKeys.reviewInsight('zh', 'default-insight', '2026-04-20', 0)

    queryClient.setQueryData(dailyAffected, { date: '2026-04-01' })
    queryClient.setQueryData(dailyUnaffected, { date: '2026-04-20' })
    queryClient.setQueryData(insightAffected, { date: '2026-04-07' })
    queryClient.setQueryData(insightUnaffected, { date: '2026-04-20' })

    const keys = collectReviewQueryKeysToInvalidate(queryClient, ['2026-04-01'])

    expect(keys).toEqual([dailyAffected, insightAffected])
  })
})
