import { startTransition, useEffect, useState } from 'react'

import type {
  BlockChangedEvent,
  Notebook,
  NotebookBlockItem,
  NotebookMutationResult,
  NotebookSummary,
} from '../../shared/types'
import { changbu } from '../lib/changbu'

function sortNotebooks(notebooks: NotebookSummary[]): NotebookSummary[] {
  return [...notebooks].sort((left, right) => {
    const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

    if (updatedDiff !== 0) {
      return updatedDiff
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

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

function toSummary(notebook: Notebook): NotebookSummary {
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

function upsertSummary(notebooks: NotebookSummary[], notebook: NotebookSummary): NotebookSummary[] {
  const next = notebooks.filter((item) => item.id !== notebook.id)
  next.push(notebook)
  return sortNotebooks(next)
}

function patchSelectedNotebook(current: Notebook | null, event: BlockChangedEvent): Notebook | null {
  if (!current || !current.items.some((item) => item.type === 'block' && item.blockId === event.block.id)) {
    return current
  }

  if (event.reason === 'deleted') {
    const nextItems = current.items
      .filter((item) => item.type !== 'block' || item.blockId !== event.block.id)
      .map((item, index) => ({
        ...item,
        sortOrder: index,
      }))

    return {
      ...current,
      items: nextItems,
      itemCount: nextItems.length,
      blockCount: nextItems.length,
      structureCount: 0,
    }
  }

  return {
    ...current,
    items: current.items.map((item) => (
      item.type === 'block' && item.blockId === event.block.id
        ? {
            ...item,
            block: event.block,
          }
        : item
    )),
  }
}

function patchNotebookSummaries(current: NotebookSummary[], event: BlockChangedEvent): NotebookSummary[] {
  let changed = false

  const next = current.map((notebook) => {
    if (event.reason !== 'deleted' || notebook.blockCount === 0) {
      return notebook
    }

    changed = true
    return {
      ...notebook,
      itemCount: Math.max(0, notebook.itemCount - 1),
      blockCount: Math.max(0, notebook.blockCount - 1),
      updatedAt: event.block.updatedAt,
    }
  })

  return changed ? sortNotebooks(next) : current
}

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([])
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingNotebook, setLoadingNotebook] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void changbu.notebooks.list()
      .then((items) => {
        if (!active) {
          return
        }

        const sorted = sortNotebooks(items)

        startTransition(() => {
          setNotebooks(sorted)
          setSelectedNotebookId((currentId) => currentId ?? sorted[0]?.id ?? null)
          setLoading(false)
        })
      })
      .catch((reason) => {
        if (!active) {
          return
        }

        setError(reason instanceof Error ? reason.message : '加载笔记本失败。')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedNotebookId) {
      setSelectedNotebook(null)
      return
    }

    let active = true
    setLoadingNotebook(true)
    setError(null)

    void changbu.notebooks.get(selectedNotebookId)
      .then((notebook) => {
        if (!active) {
          return
        }

        const visibleNotebook = toVisibleNotebook(notebook)

        startTransition(() => {
          setSelectedNotebook(visibleNotebook)
          setNotebooks((current) => upsertSummary(current, toSummary(visibleNotebook)))
        })
      })
      .catch((reason) => {
        if (!active) {
          return
        }

        setError(reason instanceof Error ? reason.message : '加载笔记本内容失败。')
      })
      .finally(() => {
        if (active) {
          setLoadingNotebook(false)
        }
      })

    return () => {
      active = false
    }
  }, [selectedNotebookId])

  useEffect(() => {
    const unsubscribe = changbu.events.onBlockChanged((event) => {
      startTransition(() => {
        setSelectedNotebook((current) => patchSelectedNotebook(current, event))
        setNotebooks((current) => patchNotebookSummaries(current, event))
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  function syncNotebook(notebook: Notebook, options: { select?: boolean } = {}): Notebook {
    const visibleNotebook = toVisibleNotebook(notebook)
    const shouldSelect = options.select ?? visibleNotebook.id === selectedNotebookId

    startTransition(() => {
      if (shouldSelect) {
        setSelectedNotebook(visibleNotebook)
        setSelectedNotebookId(visibleNotebook.id)
      }

      setNotebooks((current) => upsertSummary(current, toSummary(visibleNotebook)))
    })

    return visibleNotebook
  }

  function selectNotebook(id: string): void {
    setSelectedNotebookId(id)
  }

  async function createNotebook(title?: string): Promise<Notebook> {
    setError(null)
    const notebook = await changbu.notebooks.create(title)
    return syncNotebook(notebook, { select: true })
  }

  async function updateNotebook(id: string, title: string): Promise<Notebook> {
    setError(null)
    const notebook = await changbu.notebooks.update(id, title)
    return syncNotebook(notebook)
  }

  async function removeNotebook(id: string): Promise<void> {
    setError(null)
    await changbu.notebooks.remove(id)
    const nextNotebooks = sortNotebooks(await changbu.notebooks.list())

    startTransition(() => {
      setNotebooks(nextNotebooks)

      if (selectedNotebookId === id) {
        setSelectedNotebookId(nextNotebooks[0]?.id ?? null)
        setSelectedNotebook(null)
      }
    })
  }

  async function addBlockToNotebook(notebookId: string, blockId: string): Promise<NotebookMutationResult> {
    setError(null)
    const result = await changbu.notebooks.addBlock(notebookId, blockId)
    const notebook = syncNotebook(result.notebook)
    return {
      ...result,
      notebook,
    }
  }

  async function createNotebookWithBlock(blockId: string, title?: string): Promise<NotebookMutationResult> {
    const notebook = await createNotebook(title)
    const result = await changbu.notebooks.addBlock(notebook.id, blockId)
    const visibleNotebook = syncNotebook(result.notebook, { select: true })
    return {
      ...result,
      notebook: visibleNotebook,
    }
  }

  async function removeNotebookItem(notebookId: string, itemId: string): Promise<Notebook> {
    setError(null)
    const notebook = await changbu.notebooks.removeItem(notebookId, itemId)
    return syncNotebook(notebook)
  }

  async function reorderItems(notebookId: string, itemIds: string[]): Promise<Notebook> {
    setError(null)
    const notebook = await changbu.notebooks.reorderItems(notebookId, itemIds)
    return syncNotebook(notebook)
  }

  async function createBlockInNotebook(notebookId: string, content: string): Promise<Notebook> {
    setError(null)
    const notebook = await changbu.notebooks.createBlock(notebookId, content)
    return syncNotebook(notebook)
  }

  return {
    notebooks,
    selectedNotebookId,
    selectedNotebook,
    loading,
    loadingNotebook,
    error,
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
