import { useCallback, useMemo, useState } from 'react'

import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  Notebook,
  NotebookMutationResult,
  NotebookStructureItemInput,
  NotebookStructureItemPatch,
  NotebookSummary,
} from '../../shared/types'
import { changbu } from '../lib/changbu'
import { compareText, getCurrentLanguage } from '../i18n/locale'
import { queryKeys } from '../lib/queryKeys'

function toVisibleNotebook(notebook: Notebook): Notebook {
  return notebook
}

function compareNotebookSummaries(a: NotebookSummary, b: NotebookSummary): number {
  const updatedAtDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

  if (updatedAtDelta !== 0) {
    return updatedAtDelta
  }

  const createdAtDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  if (createdAtDelta !== 0) {
    return createdAtDelta
  }

  return compareText(a.title, b.title)
}

function toNotebookSummary(notebook: Notebook): NotebookSummary {
  return {
    id: notebook.id,
    title: notebook.title,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    itemCount: notebook.itemCount,
    blockCount: notebook.blockCount,
    structureCount: notebook.structureCount,
  }
}

function upsertNotebookSummary(list: NotebookSummary[], summary: NotebookSummary): NotebookSummary[] {
  const next = list.some((item) => item.id === summary.id)
    ? list.map((item) => (item.id === summary.id ? summary : item))
    : [...list, summary]

  return next.sort(compareNotebookSummaries)
}

function patchNotebookCaches(
  queryClient: QueryClient,
  notebook: Notebook,
): Notebook {
  const visibleNotebook = toVisibleNotebook(notebook)
  const summary = toNotebookSummary(visibleNotebook)

  queryClient.setQueryData(queryKeys.notebook(visibleNotebook.id), visibleNotebook)
  queryClient.setQueryData<NotebookSummary[]>(
    queryKeys.notebooks(),
    (current) => upsertNotebookSummary(current ?? [], summary),
  )

  return visibleNotebook
}

function removeNotebookFromCaches(queryClient: QueryClient, notebookId: string): NotebookSummary[] {
  let nextNotebooks: NotebookSummary[] = []

  queryClient.setQueryData<NotebookSummary[]>(
    queryKeys.notebooks(),
    (current) => {
      nextNotebooks = (current ?? []).filter((notebook) => notebook.id !== notebookId)
      return nextNotebooks
    },
  )
  queryClient.removeQueries({ queryKey: queryKeys.notebook(notebookId) })

  return nextNotebooks
}

export function useNotebooks() {
  const queryClient = useQueryClient()
  const [preferredNotebookId, setPreferredNotebookId] = useState<string | null>(null)
  const notebooksQuery = useQuery({
    queryKey: queryKeys.notebooks(),
    queryFn: () => changbu.notebooks.list(),
  })
  const notebooks = useMemo(() => notebooksQuery.data ?? [], [notebooksQuery.data])
  const selectedNotebookId = useMemo(() => {
    if (notebooks.length === 0) {
      return null
    }

    return preferredNotebookId && notebooks.some((notebook) => notebook.id === preferredNotebookId) ? preferredNotebookId : notebooks[0].id
  }, [notebooks, preferredNotebookId])
  const selectedNotebookQuery = useQuery({
    queryKey: selectedNotebookId ? queryKeys.notebook(selectedNotebookId) : queryKeys.notebookRoot(),
    queryFn: () => changbu.notebooks.get(selectedNotebookId!),
    enabled: Boolean(selectedNotebookId),
  })
  const selectedNotebook = useMemo(
    () => (selectedNotebookQuery.data ? toVisibleNotebook(selectedNotebookQuery.data) : null),
    [selectedNotebookQuery.data],
  )
  const loadingNotebook = Boolean(selectedNotebookId) && selectedNotebookQuery.isFetching && selectedNotebook?.id !== selectedNotebookId

  const selectNotebook = useCallback((id: string): void => {
    setPreferredNotebookId(id)
  }, [])

  const createNotebook = useCallback(async (title?: string): Promise<Notebook> => {
    const notebook = await changbu.notebooks.create(title)

    setPreferredNotebookId(notebook.id)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const updateNotebook = useCallback(async (id: string, title: string): Promise<Notebook> => {
    const notebook = await changbu.notebooks.update(id, title)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const removeNotebook = useCallback(async (id: string): Promise<void> => {
    await changbu.notebooks.remove(id)
    const nextNotebooks = removeNotebookFromCaches(queryClient, id)
    const nextSelectedNotebookId = selectedNotebookId === id ? nextNotebooks[0]?.id ?? null : selectedNotebookId

    setPreferredNotebookId(nextSelectedNotebookId)
  }, [queryClient, selectedNotebookId])

  const addBlockToNotebook = useCallback(async (notebookId: string, blockId: string): Promise<NotebookMutationResult> => {
    const result = await changbu.notebooks.addBlock(notebookId, blockId)

    return {
      ...result,
      notebook: patchNotebookCaches(queryClient, result.notebook),
    }
  }, [queryClient])

  const createNotebookWithBlock = useCallback(async (blockId: string, title?: string): Promise<NotebookMutationResult> => {
    const notebook = await changbu.notebooks.create(title)
    setPreferredNotebookId(notebook.id)
    patchNotebookCaches(queryClient, notebook)

    const result = await changbu.notebooks.addBlock(notebook.id, blockId)

    return {
      ...result,
      notebook: patchNotebookCaches(queryClient, result.notebook),
    }
  }, [queryClient])

  const removeNotebookItem = useCallback(async (notebookId: string, itemId: string): Promise<Notebook> => {
    const notebook = await changbu.notebooks.removeItem(notebookId, itemId)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const reorderItems = useCallback(async (notebookId: string, itemIds: string[]): Promise<Notebook> => {
    const notebook = await changbu.notebooks.reorderItems(notebookId, itemIds)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const createBlockInNotebook = useCallback(async (notebookId: string, content: string): Promise<Notebook> => {
    const notebook = await changbu.notebooks.createBlock(notebookId, content)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const createNotebookStructureItem = useCallback(async (notebookId: string, input: NotebookStructureItemInput): Promise<Notebook> => {
    const notebook = await changbu.notebooks.createStructureItem(notebookId, input)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  const updateNotebookStructureItem = useCallback(async (
    notebookId: string,
    itemId: string,
    patch: NotebookStructureItemPatch,
  ): Promise<Notebook> => {
    const notebook = await changbu.notebooks.updateStructureItem(notebookId, itemId, patch)

    return patchNotebookCaches(queryClient, notebook)
  }, [queryClient])

  return {
    notebooks,
    selectedNotebookId,
    selectedNotebook,
    loading: notebooksQuery.isPending,
    loadingNotebook,
    error: notebooksQuery.error instanceof Error ? notebooksQuery.error.message : notebooksQuery.error ? (getCurrentLanguage() === 'en' ? 'Failed to load notebooks.' : '加载笔记本失败。') : null,
    selectNotebook,
    createNotebook,
    updateNotebook,
    removeNotebook,
    addBlockToNotebook,
    createNotebookWithBlock,
    removeNotebookItem,
    reorderItems,
    createBlockInNotebook,
    createNotebookStructureItem,
    updateNotebookStructureItem,
  }
}
