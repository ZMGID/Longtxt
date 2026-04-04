import { useEffect, useMemo, useState } from 'react'

import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Notebook, NotebookBlockItem, NotebookMutationResult } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

function toVisibleNotebook(notebook: Notebook): Notebook {
  const items = notebook.items.filter((item): item is NotebookBlockItem => item.type === 'block')

  return {
    ...notebook,
    itemCount: items.length,
    blockCount: items.length,
    structureCount: 0,
    items,
  }
}

async function invalidateNotebookQueries(
  queryClient: QueryClient,
  notebookIds: string[] = [],
): Promise<void> {
  const invalidations = [queryClient.invalidateQueries({ queryKey: queryKeys.notebooks() })]

  if (notebookIds.length === 0) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.notebookRoot() }))
  } else {
    invalidations.push(...notebookIds.map((notebookId) => queryClient.invalidateQueries({ queryKey: queryKeys.notebook(notebookId) })))
  }

  await Promise.all(invalidations)
}

export function useNotebooks() {
  const queryClient = useQueryClient()
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const notebooksQuery = useQuery({
    queryKey: queryKeys.notebooks(),
    queryFn: () => changbu.notebooks.list(),
  })
  const selectedNotebookQuery = useQuery({
    queryKey: selectedNotebookId ? queryKeys.notebook(selectedNotebookId) : queryKeys.notebookRoot(),
    queryFn: () => changbu.notebooks.get(selectedNotebookId!),
    enabled: Boolean(selectedNotebookId),
  })
  const notebooks = notebooksQuery.data ?? []
  const selectedNotebook = useMemo(
    () => (selectedNotebookQuery.data ? toVisibleNotebook(selectedNotebookQuery.data) : null),
    [selectedNotebookQuery.data],
  )
  const loadingNotebook = Boolean(selectedNotebookId) && selectedNotebookQuery.isFetching && selectedNotebook?.id !== selectedNotebookId

  useEffect(() => {
    if (notebooks.length === 0) {
      if (selectedNotebookId !== null) {
        setSelectedNotebookId(null)
      }
      return
    }

    if (!selectedNotebookId || !notebooks.some((notebook) => notebook.id === selectedNotebookId)) {
      setSelectedNotebookId(notebooks[0].id)
    }
  }, [notebooks, selectedNotebookId])

  function selectNotebook(id: string): void {
    setSelectedNotebookId(id)
  }

  async function createNotebook(title?: string): Promise<Notebook> {
    const notebook = await changbu.notebooks.create(title)
    setSelectedNotebookId(notebook.id)
    await invalidateNotebookQueries(queryClient, [notebook.id])
    return toVisibleNotebook(notebook)
  }

  async function updateNotebook(id: string, title: string): Promise<Notebook> {
    const notebook = await changbu.notebooks.update(id, title)
    await invalidateNotebookQueries(queryClient, [id])
    return toVisibleNotebook(notebook)
  }

  async function removeNotebook(id: string): Promise<void> {
    await changbu.notebooks.remove(id)
    queryClient.removeQueries({ queryKey: queryKeys.notebook(id) })
    const nextNotebooks = await queryClient.fetchQuery({
      queryKey: queryKeys.notebooks(),
      queryFn: () => changbu.notebooks.list(),
    })
    const nextSelectedNotebookId = selectedNotebookId === id ? nextNotebooks[0]?.id ?? null : selectedNotebookId

    setSelectedNotebookId(nextSelectedNotebookId)

    if (nextSelectedNotebookId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notebook(nextSelectedNotebookId) })
    }
  }

  async function addBlockToNotebook(notebookId: string, blockId: string): Promise<NotebookMutationResult> {
    const result = await changbu.notebooks.addBlock(notebookId, blockId)
    await invalidateNotebookQueries(queryClient, [notebookId])
    return {
      ...result,
      notebook: toVisibleNotebook(result.notebook),
    }
  }

  async function createNotebookWithBlock(blockId: string, title?: string): Promise<NotebookMutationResult> {
    const notebook = await changbu.notebooks.create(title)
    const result = await changbu.notebooks.addBlock(notebook.id, blockId)
    setSelectedNotebookId(notebook.id)
    await invalidateNotebookQueries(queryClient, [notebook.id])
    return {
      ...result,
      notebook: toVisibleNotebook(result.notebook),
    }
  }

  async function removeNotebookItem(notebookId: string, itemId: string): Promise<Notebook> {
    const notebook = await changbu.notebooks.removeItem(notebookId, itemId)
    await invalidateNotebookQueries(queryClient, [notebookId])
    return toVisibleNotebook(notebook)
  }

  async function reorderItems(notebookId: string, itemIds: string[]): Promise<Notebook> {
    const notebook = await changbu.notebooks.reorderItems(notebookId, itemIds)
    await invalidateNotebookQueries(queryClient, [notebookId])
    return toVisibleNotebook(notebook)
  }

  async function createBlockInNotebook(notebookId: string, content: string): Promise<Notebook> {
    const notebook = await changbu.notebooks.createBlock(notebookId, content)
    await invalidateNotebookQueries(queryClient, [notebookId])
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tags() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot() }),
    ])
    return toVisibleNotebook(notebook)
  }

  return {
    notebooks,
    selectedNotebookId,
    selectedNotebook,
    loading: notebooksQuery.isPending,
    loadingNotebook,
    error: notebooksQuery.error instanceof Error ? notebooksQuery.error.message : notebooksQuery.error ? '加载笔记本失败。' : null,
    selectNotebook,
    createNotebook,
    updateNotebook,
    removeNotebook,
    addBlockToNotebook,
    createNotebookWithBlock,
    removeNotebookItem,
    reorderItems,
    createBlockInNotebook,
  }
}
