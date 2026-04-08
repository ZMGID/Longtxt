import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import {
  applyBlockChangedEventToFlatBlockList,
  buildFlatBlockListDataFromInfiniteData,
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

    const deletedFlat = applyBlockChangedEventToFlatBlockList(updatedFlat, {
      block: sampleBlocks[1]!,
      reason: 'deleted',
    })
    expect(deletedFlat.blocks.map((block) => block.id)).toEqual(['block-3', 'block-1'])
    expect(deletedFlat.lastChange).toMatchObject({ type: 'remove' })
  })
})
