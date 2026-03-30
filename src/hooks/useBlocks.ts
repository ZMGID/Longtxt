import { startTransition, useEffect, useRef, useState } from 'react'

import type { Block } from '../../shared/types'
import { changbu } from '../lib/changbu'

const PAGE_SIZE = 40

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function upsertBlock(blocks: Block[], block: Block): Block[] {
  const nextBlocks = [...blocks]
  const existingIndex = nextBlocks.findIndex((item) => item.id === block.id)

  if (existingIndex === -1) {
    nextBlocks.push(block)
  } else {
    nextBlocks[existingIndex] = block
  }

  return sortBlocks(nextBlocks)
}

export function useBlocks() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [nextOffset, setNextOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const blocksRef = useRef<Block[]>([])
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const nextOffsetRef = useRef(0)

  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    loadingMoreRef.current = loadingMore
  }, [loadingMore])

  useEffect(() => {
    nextOffsetRef.current = nextOffset
  }, [nextOffset])

  useEffect(() => {
    let active = true

    void changbu.blocks
      .list({ offset: 0, limit: PAGE_SIZE })
      .then((items) => {
        if (!active) {
          return
        }

        startTransition(() => {
          setBlocks(sortBlocks(items))
          setLoadingInitial(false)
          setNextOffset(items.length)
          setHasMore(items.length === PAGE_SIZE)
        })
      })
      .catch((reason) => {
        if (!active) {
          return
        }

        setError(reason instanceof Error ? reason.message : '加载块列表失败。')
        setLoadingInitial(false)
      })

    const unsubscribe = changbu.events.onBlockChanged((event) => {
      if (!active) {
        return
      }

      startTransition(() => {
        setBlocks((currentBlocks) => {
          if (event.reason === 'deleted') {
            return currentBlocks.filter((block) => block.id !== event.block.id)
          }

          return upsertBlock(currentBlocks, event.block)
        })
      })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function loadMore(): Promise<void> {
    if (loadingMoreRef.current || !hasMoreRef.current) {
      return
    }

    setLoadingMore(true)
    setError(null)

    try {
      const items = await changbu.blocks.list({ offset: nextOffset, limit: PAGE_SIZE })
      startTransition(() => {
        setBlocks((currentBlocks) => {
          const merged = [...items, ...currentBlocks]
          return sortBlocks(
            merged.filter((block, index, allBlocks) => allBlocks.findIndex((item) => item.id === block.id) === index),
          )
        })
        setNextOffset((currentOffset) => currentOffset + items.length)
        setHasMore(items.length === PAGE_SIZE)
      })
    } finally {
      setLoadingMore(false)
    }
  }

  async function ensureBlockLoaded(blockId: string): Promise<void> {
    while (!blocksRef.current.some((block) => block.id === blockId) && hasMoreRef.current && !loadingMoreRef.current) {
      await loadMore()
    }
  }

  async function createBlock(content: string): Promise<void> {
    setError(null)
    const block = await changbu.blocks.create(content)
    startTransition(() => {
      setBlocks((currentBlocks) => upsertBlock(currentBlocks, block))
    })
  }

  async function updateBlock(id: string, content: string): Promise<void> {
    setError(null)
    const block = await changbu.blocks.update(id, content)
    startTransition(() => {
      setBlocks((currentBlocks) => upsertBlock(currentBlocks, block))
    })
  }

  async function removeBlock(id: string): Promise<void> {
    setError(null)
    await changbu.blocks.remove(id)
    startTransition(() => {
      setBlocks((currentBlocks) => currentBlocks.filter((block) => block.id !== id))
    })
  }

  async function addTag(blockId: string, tagName: string): Promise<void> {
    setError(null)
    const block = await changbu.tags.add(blockId, tagName)
    startTransition(() => {
      setBlocks((currentBlocks) => upsertBlock(currentBlocks, block))
    })
  }

  async function removeTag(blockId: string, tagId: string): Promise<void> {
    setError(null)
    const block = await changbu.tags.remove(blockId, tagId)
    startTransition(() => {
      setBlocks((currentBlocks) => upsertBlock(currentBlocks, block))
    })
  }

  return {
    blocks,
    loading: loadingInitial,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    createBlock,
    updateBlock,
    removeBlock,
    addTag,
    removeTag,
    loadMore,
    ensureBlockLoaded,
  }
}
