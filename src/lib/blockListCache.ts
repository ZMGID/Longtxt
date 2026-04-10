import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import type { Block, BlockChangedEvent, BlockListCursor, BlockListPage } from '../../shared/types'
import { queryKeys } from './queryKeys'

export type BlockListInfiniteData = InfiniteData<BlockListPage, BlockListCursor | null>

export type BlockListChangeHint =
  | { type: 'noop' }
  | { type: 'reset' }
  | { type: 'append'; blocks: Block[] }
  | { type: 'prepend'; blocks: Block[] }
  | { type: 'replace'; block: Block; previousBlock: Block | null }
  | { type: 'remove'; blockId: string; removedBlock: Block | null }
  | { type: 'remove-many'; removedBlocks: Block[] }

export interface FlatBlockListData {
  blocks: Block[]
  indexById: Map<string, number>
  lastChange: BlockListChangeHint
}

export const NOOP_BLOCK_LIST_CHANGE: BlockListChangeHint = { type: 'noop' }

function buildIndexById(blocks: Block[]): Map<string, number> {
  const indexById = new Map<string, number>()

  blocks.forEach((block, index) => {
    indexById.set(block.id, index)
  })

  return indexById
}

function cloneIndexById(indexById: Map<string, number>): Map<string, number> {
  return new Map(indexById)
}

function areImageAnnotationsEquivalent(
  left: Block['imageAnnotations'],
  right: Block['imageAnnotations'],
): boolean {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((annotation, index) => {
    const other = normalizedRight[index]

    return Boolean(other)
      && annotation.index === other.index
      && annotation.annotation === other.annotation
  })
}

function areTagsEquivalent(left: Block['tags'], right: Block['tags']): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((tag, index) => {
    const other = right[index]
    return Boolean(other)
      && tag.id === other.id
      && tag.name === other.name
      && tag.isDefault === other.isDefault
      && tag.source === other.source
      && tag.kind === other.kind
  })
}

function areBlocksEquivalent(left: Block, right: Block): boolean {
  return left.id === right.id
    && left.content === right.content
    && left.summary === right.summary
    && areImageAnnotationsEquivalent(left.imageAnnotations, right.imageAnnotations)
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.status === right.status
    && left.aiMode === right.aiMode
    && left.errorMessage === right.errorMessage
    && left.errorCode === right.errorCode
    && areTagsEquivalent(left.tags, right.tags)
}

function createFlatBlockListDataWithIndex(
  blocks: Block[],
  indexById: Map<string, number>,
  lastChange: BlockListChangeHint,
): FlatBlockListData {
  return {
    blocks,
    indexById,
    lastChange,
  }
}

function createFlatBlockListData(blocks: Block[], lastChange: BlockListChangeHint): FlatBlockListData {
  return createFlatBlockListDataWithIndex(blocks, buildIndexById(blocks), lastChange)
}

function dedupeBlocks(blocks: Block[]): Block[] {
  const blockMap = new Map<string, Block>()

  for (const block of blocks) {
    if (!blockMap.has(block.id)) {
      blockMap.set(block.id, block)
    }
  }

  return Array.from(blockMap.values())
}

export function createEmptyFlatBlockListData(): FlatBlockListData {
  return createFlatBlockListData([], NOOP_BLOCK_LIST_CHANGE)
}

function flattenPages(data?: BlockListInfiniteData): Block[] {
  if (!data) {
    return []
  }

  return dedupeBlocks(data.pages.flatMap((page) => page.items))
}

export function buildFlatBlockListDataFromInfiniteData(data?: BlockListInfiniteData): FlatBlockListData {
  return createFlatBlockListData(flattenPages(data), { type: 'reset' })
}

export function insertBlockIntoCache(
  data: BlockListInfiniteData | undefined,
  block: Block,
): BlockListInfiniteData {
  const cleaned = removeBlockFromCache(data, block.id)

  if (!cleaned) {
    return {
      pageParams: [null],
      pages: [{
        items: [block],
        nextCursor: null,
        hasMore: false,
      }],
    }
  }

  const [firstPage, ...restPages] = cleaned.pages

  if (!firstPage) {
    return {
      ...cleaned,
      pageParams: cleaned.pageParams.length > 0 ? cleaned.pageParams : [null],
      pages: [{
        items: [block],
        nextCursor: null,
        hasMore: false,
      }],
    }
  }

  return {
    ...cleaned,
    pages: [
      {
        ...firstPage,
        items: [block, ...firstPage.items],
      },
      ...restPages,
    ],
  }
}

export function replaceBlockInCache(
  data: BlockListInfiniteData | undefined,
  block: Block,
): BlockListInfiniteData | undefined {
  if (!data) {
    return data
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === block.id ? block : item)),
    })),
  }
}

export function removeBlockFromCache(
  data: BlockListInfiniteData | undefined,
  blockId: string,
): BlockListInfiniteData | undefined {
  if (!data) {
    return data
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== blockId),
    })),
  }
}

export function removeBlocksFromCache(
  data: BlockListInfiniteData | undefined,
  blockIds: string[],
): BlockListInfiniteData | undefined {
  if (!data || blockIds.length === 0) {
    return data
  }

  const blockIdSet = new Set(blockIds)

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => !blockIdSet.has(item.id)),
    })),
  }
}

export function applyBlockChangedEventToCache(
  data: BlockListInfiniteData | undefined,
  event: BlockChangedEvent,
): BlockListInfiniteData | undefined {
  switch (event.reason) {
    case 'created':
      return insertBlockIntoCache(data, event.block)
    case 'deleted':
      return removeBlockFromCache(data, event.block.id)
    case 'updated':
    case 'enriched':
    case 'tagged':
      return replaceBlockInCache(data, event.block)
    default:
      return data
  }
}

export function applyBlockChangedEventsToCache(
  data: BlockListInfiniteData | undefined,
  events: BlockChangedEvent[],
): BlockListInfiniteData | undefined {
  return events.reduce<BlockListInfiniteData | undefined>(
    (current, event) => applyBlockChangedEventToCache(current, event),
    data,
  )
}

function withNoopChange(current?: FlatBlockListData): FlatBlockListData {
  return current ?? createEmptyFlatBlockListData()
}

function mergeBlockChangedEvent(previous: BlockChangedEvent | undefined, next: BlockChangedEvent): BlockChangedEvent {
  if (next.reason === 'created' || next.reason === 'deleted') {
    return next
  }

  if (previous?.reason === 'created') {
    return {
      reason: 'created',
      block: next.block,
    }
  }

  return next
}

export function coalesceBlockChangedEvents(events: BlockChangedEvent[]): BlockChangedEvent[] {
  if (events.length <= 1) {
    return events
  }

  const eventByBlockId = new Map<string, { event: BlockChangedEvent; lastIndex: number }>()

  events.forEach((event, index) => {
    const previous = eventByBlockId.get(event.block.id)?.event

    eventByBlockId.set(event.block.id, {
      event: mergeBlockChangedEvent(previous, event),
      lastIndex: index,
    })
  })

  return Array.from(eventByBlockId.values())
    .sort((left, right) => left.lastIndex - right.lastIndex)
    .map((entry) => entry.event)
}

export function prependBlocksToFlatBlockList(
  current: FlatBlockListData | undefined,
  prependedBlocks: Block[],
): FlatBlockListData {
  if (prependedBlocks.length === 0) {
    return withNoopChange(current)
  }

  const base = current ?? createEmptyFlatBlockListData()
  const nextBlocks = dedupeBlocks([...prependedBlocks, ...base.blocks])

  if (nextBlocks.length === base.blocks.length && nextBlocks.every((block, index) => areBlocksEquivalent(block, base.blocks[index]!))) {
    return base
  }

  return createFlatBlockListData(nextBlocks, { type: 'prepend', blocks: prependedBlocks })
}

export function appendBlocksToFlatBlockList(
  current: FlatBlockListData | undefined,
  appendedBlocks: Block[],
): FlatBlockListData {
  if (appendedBlocks.length === 0) {
    return withNoopChange(current)
  }

  const base = current ?? createEmptyFlatBlockListData()
  const dedupedAppendedBlocks = appendedBlocks.filter((block) => !base.indexById.has(block.id))

  if (dedupedAppendedBlocks.length === 0) {
    return base
  }

  const nextBlocks = [...base.blocks, ...dedupedAppendedBlocks]
  const nextIndexById = cloneIndexById(base.indexById)

  dedupedAppendedBlocks.forEach((block, index) => {
    nextIndexById.set(block.id, base.blocks.length + index)
  })

  return createFlatBlockListDataWithIndex(nextBlocks, nextIndexById, {
    type: 'append',
    blocks: dedupedAppendedBlocks,
  })
}

export function replaceBlockInFlatBlockList(
  current: FlatBlockListData | undefined,
  block: Block,
): FlatBlockListData {
  const base = current ?? createEmptyFlatBlockListData()
  const blockIndex = base.indexById.get(block.id)

  if (blockIndex === undefined) {
    return base
  }

  const previousBlock = base.blocks[blockIndex] ?? null

  if (!previousBlock || areBlocksEquivalent(previousBlock, block)) {
    return base
  }

  const nextBlocks = base.blocks.slice()
  nextBlocks[blockIndex] = block

  return createFlatBlockListDataWithIndex(nextBlocks, base.indexById, {
    type: 'replace',
    block,
    previousBlock,
  })
}

export function removeBlockFromFlatBlockList(
  current: FlatBlockListData | undefined,
  blockId: string,
): FlatBlockListData {
  const base = current ?? createEmptyFlatBlockListData()
  const blockIndex = base.indexById.get(blockId)

  if (blockIndex === undefined) {
    return base
  }

  const removedBlock = base.blocks[blockIndex] ?? null
  const nextBlocks = base.blocks.filter((block) => block.id !== blockId)

  return createFlatBlockListData(nextBlocks, {
    type: 'remove',
    blockId,
    removedBlock,
  })
}

export function removeBlocksFromFlatBlockList(
  current: FlatBlockListData | undefined,
  blockIds: string[],
): FlatBlockListData {
  if (blockIds.length === 0) {
    return withNoopChange(current)
  }

  const base = current ?? createEmptyFlatBlockListData()
  const blockIdSet = new Set(blockIds)
  const removedBlocks = base.blocks.filter((block) => blockIdSet.has(block.id))

  if (removedBlocks.length === 0) {
    return base
  }

  const nextBlocks = base.blocks.filter((block) => !blockIdSet.has(block.id))
  const lastChange: BlockListChangeHint = removedBlocks.length === 1
    ? {
        type: 'remove',
        blockId: removedBlocks[0]!.id,
        removedBlock: removedBlocks[0]!,
      }
    : {
        type: 'remove-many',
        removedBlocks,
      }

  return createFlatBlockListData(nextBlocks, lastChange)
}

export function applyBlockChangedEventToFlatBlockList(
  current: FlatBlockListData | undefined,
  event: BlockChangedEvent,
): FlatBlockListData {
  switch (event.reason) {
    case 'created':
      return prependBlocksToFlatBlockList(current, [event.block])
    case 'deleted':
      return removeBlockFromFlatBlockList(current, event.block.id)
    case 'updated':
    case 'enriched':
    case 'tagged':
      return replaceBlockInFlatBlockList(current, event.block)
    default:
      return withNoopChange(current)
  }
}

export function applyBlockChangedEventsToFlatBlockList(
  current: FlatBlockListData | undefined,
  events: BlockChangedEvent[],
): FlatBlockListData {
  return events.reduce<FlatBlockListData>(
    (nextState, event) => applyBlockChangedEventToFlatBlockList(nextState, event),
    current ?? createEmptyFlatBlockListData(),
  )
}

export function syncFlatBlockListWithInfiniteData(
  current: FlatBlockListData | undefined,
  previousData: BlockListInfiniteData | undefined,
  nextData: BlockListInfiniteData | undefined,
): FlatBlockListData {
  if (!nextData) {
    return createEmptyFlatBlockListData()
  }

  if (!previousData || !current || current.blocks.length === 0) {
    return buildFlatBlockListDataFromInfiniteData(nextData)
  }

  if (nextData.pages.length < previousData.pages.length) {
    return buildFlatBlockListDataFromInfiniteData(nextData)
  }

  if (nextData.pages.length > previousData.pages.length) {
    const appendedBlocks = nextData.pages.slice(previousData.pages.length).flatMap((page) => page.items)
    return appendBlocksToFlatBlockList(current, appendedBlocks)
  }

  return current
}

export function updateBlockListCache(
  queryClient: QueryClient,
  updater: (data: BlockListInfiniteData | undefined) => BlockListInfiniteData | undefined,
): void {
  queryClient.setQueryData<BlockListInfiniteData>(queryKeys.blocks(), updater)
}

export function updateFlatBlockListCache(
  queryClient: QueryClient,
  updater: (data: FlatBlockListData | undefined) => FlatBlockListData,
): void {
  queryClient.setQueryData<FlatBlockListData>(queryKeys.blocksFlat(), updater)
}
