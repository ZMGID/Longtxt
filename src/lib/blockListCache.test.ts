import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import {
  applyBlockChangedEventToFlatBlockList,
  buildFlatBlockListDataFromInfiniteData,
  coalesceBlockChangedEvents,
  syncFlatBlockListWithInfiniteData,
} from './blockListCache'

const sampleBlocks: Block[] = [
  {
    id: 'block-3',
    content: '第三条',
    tags: [],
    createdAt: '2026-04-03T09:00:00.000Z',
    updatedAt: '2026-04-03T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-2',
    content: '第二条',
    tags: [],
    createdAt: '2026-04-02T09:00:00.000Z',
    updatedAt: '2026-04-02T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
  {
    id: 'block-1',
    content: '第一条',
    tags: [],
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-01T09:00:00.000Z',
    status: 'ready',
    aiMode: 'mock',
  },
]

describe('block list cache helpers', () => {
  it('appends only newly loaded pages into the flat cache', () => {
    const firstPageData = {
      pageParams: [null],
      pages: [{
        items: sampleBlocks.slice(0, 2),
        nextCursor: { createdAt: sampleBlocks[1]!.createdAt, id: sampleBlocks[1]!.id },
        hasMore: true,
      }],
    }
    const secondPageData = {
      pageParams: [null, { createdAt: sampleBlocks[1]!.createdAt, id: sampleBlocks[1]!.id }],
      pages: [
        firstPageData.pages[0],
        {
          items: [sampleBlocks[2]!],
          nextCursor: null,
          hasMore: false,
        },
      ],
    }

    const initialFlat = buildFlatBlockListDataFromInfiniteData(firstPageData)
    const nextFlat = syncFlatBlockListWithInfiniteData(initialFlat, firstPageData, secondPageData)

    expect(nextFlat.blocks.map((block) => block.id)).toEqual(['block-3', 'block-2', 'block-1'])
    expect(nextFlat.lastChange).toMatchObject({
      type: 'append',
    })
  })

  it('updates the flat cache incrementally for create, update, and delete events', () => {
    const initialFlat = buildFlatBlockListDataFromInfiniteData({
      pageParams: [null],
      pages: [{
        items: [sampleBlocks[1]!, sampleBlocks[2]!],
        nextCursor: null,
        hasMore: false,
      }],
    })

    const createdFlat = applyBlockChangedEventToFlatBlockList(initialFlat, {
      block: sampleBlocks[0]!,
      reason: 'created',
    })
    expect(createdFlat.blocks.map((block) => block.id)).toEqual(['block-3', 'block-2', 'block-1'])
    expect(createdFlat.lastChange).toMatchObject({ type: 'prepend' })

    const updatedFlat = applyBlockChangedEventToFlatBlockList(createdFlat, {
      block: {
        ...sampleBlocks[1]!,
        content: '第二条（已更新）',
      },
      reason: 'updated',
    })
    expect(updatedFlat.blocks[1]?.content).toBe('第二条（已更新）')
    expect(updatedFlat.lastChange).toMatchObject({ type: 'replace' })

    const updatedAgainFlat = applyBlockChangedEventToFlatBlockList(updatedFlat, {
      block: {
        ...sampleBlocks[2]!,
        content: '第一条（再次更新）',
      },
      reason: 'updated',
    })
    expect(updatedAgainFlat.blocks[2]?.content).toBe('第一条（再次更新）')
    expect(updatedAgainFlat.lastChange).toMatchObject({ type: 'replace' })

    const deletedFlat = applyBlockChangedEventToFlatBlockList(updatedAgainFlat, {
      block: sampleBlocks[1]!,
      reason: 'deleted',
    })
    expect(deletedFlat.blocks.map((block) => block.id)).toEqual(['block-3', 'block-1'])
    expect(deletedFlat.lastChange).toMatchObject({ type: 'remove' })
  })

  it('returns the original flat cache when deleting an unloaded block', () => {
    const initialFlat = buildFlatBlockListDataFromInfiniteData({
      pageParams: [null],
      pages: [{
        items: [sampleBlocks[1]!, sampleBlocks[2]!],
        nextCursor: null,
        hasMore: false,
      }],
    })

    const nextFlat = applyBlockChangedEventToFlatBlockList(initialFlat, {
      block: sampleBlocks[0]!,
      reason: 'deleted',
    })

    expect(nextFlat).toBe(initialFlat)
  })

  it('coalesces duplicate block events while preserving the latest payload and stable order', () => {
    const taggedBlock = {
      ...sampleBlocks[1]!,
      tags: [{
        id: 'tag-1',
        name: '项目',
        isDefault: false,
        source: 'manual' as const,
        kind: 'user' as const,
      }],
    }

    const coalesced = coalesceBlockChangedEvents([
      {
        block: sampleBlocks[2]!,
        reason: 'created',
      },
      {
        block: {
          ...sampleBlocks[1]!,
          content: '第二条（已更新）',
        },
        reason: 'updated',
      },
      {
        block: {
          ...sampleBlocks[2]!,
          summary: '新摘要',
          imageAnnotations: [{
            index: 0,
            annotation: '图像描述',
          }],
        },
        reason: 'enriched',
      },
      {
        block: taggedBlock,
        reason: 'tagged',
      },
      {
        block: sampleBlocks[0]!,
        reason: 'updated',
      },
      {
        block: sampleBlocks[0]!,
        reason: 'deleted',
      },
    ])

    expect(coalesced).toHaveLength(3)
    expect(coalesced.map((event) => [event.block.id, event.reason])).toEqual([
      ['block-1', 'created'],
      ['block-2', 'tagged'],
      ['block-3', 'deleted'],
    ])
    expect(coalesced[0]?.block.summary).toBe('新摘要')
    expect(coalesced[0]?.block.imageAnnotations).toEqual([{
      index: 0,
      annotation: '图像描述',
    }])
    expect(coalesced[1]?.block.tags).toEqual(taggedBlock.tags)
  })
})
