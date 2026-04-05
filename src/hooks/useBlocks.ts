import { useMemo } from 'react'

import { QueryClient, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'

import type { Block } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

const PAGE_SIZE = 40

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function flattenPages(data?: InfiniteData<Block[]>): Block[] {
  if (!data) {
    return []
  }

  const blockMap = new Map<string, Block>()

  for (const page of data.pages) {
    for (const block of page) {
      if (!blockMap.has(block.id)) {
        blockMap.set(block.id, block)
      }
    }
  }

  return sortBlocks(Array.from(blockMap.values()))
}

function updateBlockPages(
  data: InfiniteData<Block[]> | undefined,
  updater: (page: Block[]) => Block[],
): InfiniteData<Block[]> | undefined {
  if (!data) {
    return data
  }

  return {
    ...data,
    pages: data.pages.map((page) => updater(page)),
  }
}

function insertBlockIntoCache(
  data: InfiniteData<Block[]> | undefined,
  block: Block,
): InfiniteData<Block[]> {
  if (!data) {
    return {
      pageParams: [0],
      pages: [[block]],
    }
  }

  const [firstPage = [], ...restPages] = data.pages

  return {
    ...data,
    pages: [[block, ...firstPage.filter((item) => item.id !== block.id)], ...restPages],
  }
}

function replaceBlockInCache(
  data: InfiniteData<Block[]> | undefined,
  block: Block,
): InfiniteData<Block[]> | undefined {
  return updateBlockPages(data, (page) => page.map((item) => (item.id === block.id ? block : item)))
}

function removeBlockFromCache(
  data: InfiniteData<Block[]> | undefined,
  blockId: string,
): InfiniteData<Block[]> | undefined {
  return updateBlockPages(data, (page) => page.filter((item) => item.id !== blockId))
}

function primeBlockCache(
  queryClient: QueryClient,
  updater: (data: InfiniteData<Block[]> | undefined) => InfiniteData<Block[]> | undefined,
): void {
  queryClient.setQueryData<InfiniteData<Block[]>>(queryKeys.blocks(), updater)
}

export function useBlocks() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: queryKeys.blocks(),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => changbu.blocks.list({ offset: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) => (
      lastPage.length === PAGE_SIZE
        ? allPages.reduce((count, page) => count + page.length, 0)
        : undefined
    ),
  })
  const blocks = useMemo(() => flattenPages(query.data), [query.data])

  function getLoadedBlocks(): Block[] {
    return flattenPages(queryClient.getQueryData<InfiniteData<Block[]>>(queryKeys.blocks()))
  }

  function hasMorePages(): boolean {
    const cached = queryClient.getQueryData<InfiniteData<Block[]>>(queryKeys.blocks())
    const lastPage = cached?.pages.at(-1)

    if (!lastPage) {
      return true
    }

    return lastPage.length === PAGE_SIZE
  }

  async function loadMore(): Promise<void> {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return
    }

    await query.fetchNextPage()
  }

  async function ensureBlockLoaded(blockId: string): Promise<void> {
    if (!query.data && !query.isPending) {
      await query.refetch()
    }

    while (!getLoadedBlocks().some((block) => block.id === blockId) && hasMorePages()) {
      await query.fetchNextPage()
    }
  }

  async function createBlock(content: string): Promise<void> {
    const block = await changbu.blocks.create(content)
    primeBlockCache(queryClient, (current) => insertBlockIntoCache(current, block))
  }

  async function updateBlock(id: string, content: string): Promise<void> {
    const block = await changbu.blocks.update(id, content)
    primeBlockCache(queryClient, (current) => replaceBlockInCache(current, block))
  }

  async function removeBlock(id: string): Promise<void> {
    await changbu.blocks.remove(id)
    primeBlockCache(queryClient, (current) => removeBlockFromCache(current, id))
  }

  async function addTag(blockId: string, tagName: string): Promise<void> {
    await changbu.tags.add(blockId, tagName)
  }

  async function removeTag(blockId: string, tagId: string): Promise<void> {
    await changbu.tags.remove(blockId, tagId)
  }

  return {
    blocks,
    loading: query.isPending,
    loadingInitial: query.isPending,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    error: query.error instanceof Error ? query.error.message : query.error ? '加载块列表失败。' : null,
    createBlock,
    updateBlock,
    removeBlock,
    addTag,
    removeTag,
    loadMore,
    ensureBlockLoaded,
  }
}
