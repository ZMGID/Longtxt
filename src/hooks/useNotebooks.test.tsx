import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { BlockChangedEvent, ChangbuApi, MetaChangedEvent, Notebook, NotebookChangedEvent, NotebookSummary } from '../../shared/types'
import { ChangbuEventBridge } from '../components/ChangbuEventBridge'
import { useNotebooks } from './useNotebooks'

function createNotebookApiMock() {
  const blockListeners = new Set<(event: BlockChangedEvent) => void>()
  const notebookListeners = new Set<(event: NotebookChangedEvent) => void>()
  const metaListeners = new Set<(event: MetaChangedEvent) => void>()
  let notebooks: NotebookSummary[] = [
    {
      id: 'notebook-1',
      title: '发布工作台',
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-01T09:00:00.000Z',
      itemCount: 1,
      blockCount: 1,
      structureCount: 0,
    },
  ]
  let notebook: Notebook = {
    ...notebooks[0],
    items: [
      {
        id: 'item-1',
        type: 'block',
        blockId: 'block-1',
        sortOrder: 0,
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
        block: {
          id: 'block-1',
          content: '第一条笔记本块',
          summary: null,
          tags: [],
          createdAt: '2026-04-01T09:00:00.000Z',
          updatedAt: '2026-04-01T09:00:00.000Z',
          status: 'ready',
          aiMode: 'mock',
          errorMessage: null,
        },
      },
    ],
  }

  function getFirstNotebookBlock() {
    const blockItem = notebook.items.find((item) => item.type === 'block')

    if (!blockItem || blockItem.type !== 'block') {
      throw new Error('Expected a block item in the mocked notebook.')
    }

    return blockItem.block
  }

  const api: ChangbuApi = {
    blocks: {
      create: async () => getFirstNotebookBlock(),
      get: async () => getFirstNotebookBlock(),
      list: async () => [],
      update: async () => getFirstNotebookBlock(),
      remove: async () => undefined,
      findRelated: async () => [],
    },
    attachments: {
      saveImage: async () => ({ fileUrl: 'file:///tmp/mock.png', markdownAlt: 'mock' }),
    },
    graph: {
      getData: async () => ({ nodes: [], edges: [] }),
    },
    search: {
      blocks: async () => [],
      byTag: async () => [],
      generate: async () => ({
        requestId: 'request-1',
        topic: 'topic',
        mode: 'mock',
        blockIds: [],
      }),
    },
    snapshots: {
      save: async () => ({
        id: 'snapshot-1',
        topic: 'topic',
        content: 'content',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
      }),
      list: async () => [],
      get: async () => ({
        id: 'snapshot-1',
        topic: 'topic',
        content: 'content',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
      }),
      remove: async () => undefined,
    },
    notebooks: {
      list: vi.fn(async () => notebooks),
      get: vi.fn(async () => notebook),
      create: async () => notebook,
      update: async () => notebook,
      remove: async () => undefined,
      addBlock: async () => ({ notebook, added: true }),
      removeItem: async () => notebook,
      reorderItems: async () => notebook,
      createBlock: async () => notebook,
      createStructureItem: async () => notebook,
      updateStructureItem: async () => notebook,
      getReferencePreview: async () => ({
        notebookId: notebook.id,
        topic: 'topic',
        maxReferenceBlocks: 5,
        candidateCount: 0,
        selectedCount: 0,
        candidates: [],
      }),
      updateReferenceReview: async () => ({
        notebookId: notebook.id,
        topic: 'topic',
        maxReferenceBlocks: 5,
        candidateCount: 0,
        selectedCount: 0,
        candidates: [],
      }),
      generateDocument: async () => ({
        requestId: 'request-2',
        topic: 'topic',
        mode: 'mock',
        blockIds: ['block-1'],
        notebookId: notebook.id,
      }),
    },
    exports: {
      markdown: async () => null,
      json: async () => null,
    },
    imports: {
      previewMarkdown: async () => null,
      previewJson: async () => null,
      confirm: async () => ({ imported: 0 }),
    },
    tags: {
      add: async () => getFirstNotebookBlock(),
      remove: async () => getFirstNotebookBlock(),
      list: async () => [],
    },
    settings: {
      get: async () => null,
      set: async () => undefined,
      testApi: async () => ({
        success: true,
        modelsOk: true,
        embeddingOk: true,
        llmOk: true,
        llmStreamingOk: true,
        resolvedBaseUrl: 'https://api.example.com',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 4,
        chatModel: 'gpt-4o-mini',
        checkedAt: '2026-04-01T09:00:00.000Z',
      }),
      openDataDirectory: async () => undefined,
      getMeta: async () => ({
        dataDirectory: '/tmp',
        totalBlockCount: 1,
        vectorReady: true,
        aiConfigured: false,
        resolvedBaseUrl: null,
        vectorDimension: 4,
        vectorSchemaReady: true,
        activeAiMode: 'mock',
        lastAiError: null,
        lastAiTestResult: null,
        tokenUsage: null,
        failedVectorCount: 0,
      }),
    },
    vectors: {
      retryFailed: async () => 0,
    },
    events: {
      onBlockChanged(listener) {
        blockListeners.add(listener)
        return () => {
          blockListeners.delete(listener)
        }
      },
      onNotebooksChanged(listener) {
        notebookListeners.add(listener)
        return () => {
          notebookListeners.delete(listener)
        }
      },
      onMetaChanged(listener) {
        metaListeners.add(listener)
        return () => {
          metaListeners.delete(listener)
        }
      },
      onDocGenerationChunk(_listener) {
        return () => undefined
      },
    },
  }

  window.changbu = api

  return {
    api,
    setState(nextState: { notebooks?: NotebookSummary[]; notebook?: Notebook }) {
      notebooks = nextState.notebooks ?? notebooks
      notebook = nextState.notebook ?? notebook
    },
    emitBlockChanged(event: BlockChangedEvent) {
      for (const listener of blockListeners) {
        listener(event)
      }
    },
    emitNotebooksChanged(event: NotebookChangedEvent) {
      for (const listener of notebookListeners) {
        listener(event)
      }
    },
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChangbuEventBridge />
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useNotebooks', () => {
  it('does not change notebook summaries when an unrelated block deletion event arrives', async () => {
    const { api, emitBlockChanged } = createNotebookApiMock()
    const wrapper = createWrapper()
    const { result } = renderHook(() => useNotebooks(), { wrapper })

    await waitFor(() => {
      expect(result.current.notebooks).toHaveLength(1)
      expect(result.current.selectedNotebook?.blockCount).toBe(1)
    })

    act(() => {
      emitBlockChanged({
        reason: 'deleted',
        block: {
          id: 'unrelated-block',
          content: '别的块被删了',
          summary: null,
          tags: [],
          createdAt: '2026-04-02T09:00:00.000Z',
          updatedAt: '2026-04-02T09:00:00.000Z',
          status: 'ready',
          aiMode: 'mock',
          errorMessage: null,
        },
      })
    })

    await waitFor(() => {
      expect(result.current.notebooks[0]?.blockCount).toBe(1)
      expect(api.notebooks.list).toHaveBeenCalledTimes(1)
      expect(api.notebooks.get).toHaveBeenCalledTimes(1)
    })
  })

  it('refetches notebook data when notebooksChanged is emitted', async () => {
    const { api, emitNotebooksChanged, setState } = createNotebookApiMock()
    const wrapper = createWrapper()
    const { result } = renderHook(() => useNotebooks(), { wrapper })

    await waitFor(() => {
      expect(result.current.selectedNotebook?.blockCount).toBe(1)
    })

    setState({
      notebooks: [
        {
          id: 'notebook-1',
          title: '发布工作台',
          createdAt: '2026-04-01T09:00:00.000Z',
          updatedAt: '2026-04-02T09:00:00.000Z',
          itemCount: 2,
          blockCount: 2,
          structureCount: 0,
        },
      ],
      notebook: {
        id: 'notebook-1',
        title: '发布工作台',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-02T09:00:00.000Z',
        itemCount: 2,
        blockCount: 2,
        structureCount: 0,
        items: [
          {
            id: 'item-1',
            type: 'block',
            blockId: 'block-1',
            sortOrder: 0,
            createdAt: '2026-04-01T09:00:00.000Z',
            updatedAt: '2026-04-01T09:00:00.000Z',
            block: {
              id: 'block-1',
              content: '第一条笔记本块',
              summary: null,
              tags: [],
              createdAt: '2026-04-01T09:00:00.000Z',
              updatedAt: '2026-04-01T09:00:00.000Z',
              status: 'ready',
              aiMode: 'mock',
              errorMessage: null,
            },
          },
          {
            id: 'item-2',
            type: 'block',
            blockId: 'block-2',
            sortOrder: 1,
            createdAt: '2026-04-02T09:00:00.000Z',
            updatedAt: '2026-04-02T09:00:00.000Z',
            block: {
              id: 'block-2',
              content: '第二条笔记本块',
              summary: null,
              tags: [],
              createdAt: '2026-04-02T09:00:00.000Z',
              updatedAt: '2026-04-02T09:00:00.000Z',
              status: 'ready',
              aiMode: 'mock',
              errorMessage: null,
            },
          },
        ],
      },
    })

    act(() => {
      emitNotebooksChanged({
        notebookIds: ['notebook-1'],
        reason: 'block-linked',
      })
    })

    await waitFor(() => {
      expect(result.current.notebooks[0]?.blockCount).toBe(2)
      expect(result.current.selectedNotebook?.blockCount).toBe(2)
    })

    expect(api.notebooks.list).toHaveBeenCalledTimes(2)
    expect(api.notebooks.get).toHaveBeenCalledTimes(2)
  })
})
