import { useCallback, useEffect, useRef } from 'react'

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'

import type { BlockBatchRemoveResult, BlockListCursor, BlockListPage } from '../../shared/types'
import { getCurrentLanguage } from '../i18n/locale'
import { changbu } from '../lib/changbu'
import {
  buildFlatBlockListDataFromInfiniteData,
  createEmptyFlatBlockListData,
  prependBlocksToFlatBlockList,
  insertBlockIntoCache,
  removeBlockFromFlatBlockList,
  removeBlocksFromFlatBlockList,
  removeBlockFromCache,
  removeBlocksFromCache,
  replaceBlockInFlatBlockList,
  replaceBlockInCache,
  syncFlatBlockListWithInfiniteData,
  updateFlatBlockListCache,
  updateBlockListCache,
  type BlockListInfiniteData,
} from '../lib/blockListCache'
import { removeBlocksCompat } from '../lib/blockCleanupCompat'
import { queryKeys } from '../lib/queryKeys'

const PAGE_SIZE = 40

export function useBlocks() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery<
    BlockListPage,
    Error,
    BlockListInfiniteData,
    ReturnType<typeof queryKeys.blocks>,
    BlockListCursor | null
  >({
    queryKey: queryKeys.blocks(),
    initialPageParam: null,
    queryFn: ({ pageParam }) => changbu.blocks.list({ cursor: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
  const flatQuery = useQuery({
    queryKey: queryKeys.blocksFlat(),
    queryFn: async () => createEmptyFlatBlockListData(),
    initialData: createEmptyFlatBlockListData,
    enabled: false,
  })
  const previousDataRef = useRef<BlockListInfiniteData | undefined>(undefined)

  useEffect(() => {
    updateFlatBlockListCache(queryClient, (current) => syncFlatBlockListWithInfiniteData(current, previousDataRef.current, query.data))
    previousDataRef.current = query.data
  }, [query.data, queryClient])

  const flatState = flatQuery.data && (flatQuery.data.blocks.length > 0 || !query.data)
    ? flatQuery.data
    : buildFlatBlockListDataFromInfiniteData(query.data)
  const blocks = flatState.blocks

  const loadMore = useCallback(async (): Promise<void> => {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return
    }

    await query.fetchNextPage()
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

  const createBlock = useCallback(async (content: string): Promise<void> => {
    const block = await changbu.blocks.create(content)
    updateBlockListCache(queryClient, (current) => insertBlockIntoCache(current, block))
    updateFlatBlockListCache(queryClient, (current) => prependBlocksToFlatBlockList(current, [block]))
  }, [queryClient])

  const updateBlock = useCallback(async (id: string, content: string): Promise<void> => {
    const block = await changbu.blocks.update(id, content)
    updateBlockListCache(queryClient, (current) => replaceBlockInCache(current, block))
    updateFlatBlockListCache(queryClient, (current) => replaceBlockInFlatBlockList(current, block))
  }, [queryClient])

  const removeBlock = useCallback(async (id: string): Promise<void> => {
    await changbu.blocks.remove(id)
    updateBlockListCache(queryClient, (current) => removeBlockFromCache(current, id))
    updateFlatBlockListCache(queryClient, (current) => removeBlockFromFlatBlockList(current, id))
  }, [queryClient])

  const removeBlocks = useCallback(async (ids: string[]): Promise<BlockBatchRemoveResult> => {
    const result = await removeBlocksCompat(ids)

    if (result.removedIds.length > 0) {
      updateBlockListCache(queryClient, (current) => removeBlocksFromCache(current, result.removedIds))
      updateFlatBlockListCache(queryClient, (current) => removeBlocksFromFlatBlockList(current, result.removedIds))
    }

    return result
  }, [queryClient])

  const addTag = useCallback(async (blockId: string, tagName: string): Promise<void> => {
    await changbu.tags.add(blockId, tagName)
  }, [])

  const removeTag = useCallback(async (blockId: string, tagId: string): Promise<void> => {
    await changbu.tags.remove(blockId, tagId)
  }, [])

  return {
    blocks,
    blockChangeHint: flatState.lastChange,
    loading: query.isPending,
    loadingInitial: query.isPending,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    error: query.error instanceof Error ? query.error.message : query.error ? (getCurrentLanguage() === 'en' ? 'Failed to load blocks.' : '加载块列表失败。') : null,
    createBlock,
    updateBlock,
    removeBlock,
    removeBlocks,
    addTag,
    removeTag,
    loadMore,
  }
}
