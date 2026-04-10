import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AppEventBatch, BlockChangedEvent, CalendarChangedEvent, ChangbuApi, MetaChangedEvent, Notebook, NotebookChangedEvent, NotebookSummary } from '../../shared/types'
import { ChangbuEventBridge } from '../components/ChangbuEventBridge'
import { useNotebooks } from './useNotebooks'

function createNotebookApiMock() {
  const blockListeners = new Set<(event: BlockChangedEvent) => void>()
  const batchListeners = new Set<(batch: AppEventBatch) => void>()
  const notebookListeners = new Set<(event: NotebookChangedEvent) => void>()
  const metaListeners = new Set<(event: MetaChangedEvent) => void>()
  const calendarListeners = new Set<(event: CalendarChangedEvent) => void>()
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
      getMany: async (ids) => ids.map(() => getFirstNotebookBlock()),
      getContext: async () => [getFirstNotebookBlock()],
      list: async () => ({ items: [], nextCursor: null, hasMore: false }),
      listByDate: async () => [],
      update: async () => getFirstNotebookBlock(),
      remove: async () => undefined,
      removeMany: async () => ({ removed: 0, removedIds: [] }),
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
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      update: async () => ({
        id: 'snapshot-1',
        topic: 'topic',
        content: 'content',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:05:00.000Z',
      }),
      list: async () => [],
      get: async () => ({
        id: 'snapshot-1',
        topic: 'topic',
        content: 'content',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      remove: async () => undefined,
    },
    calendar: {
      listYears: async () => [2026],
      getYearHeatmap: async () => ({
        year: 2026,
        totalContributions: 1,
        maxBlockCount: 1,
        days: [],
      }),
      getDayDetail: async () => ({
        date: '2026-04-01',
        blockCount: 0,
        blocks: [],
        entries: [],
        suggestions: [],
      }),
      listUpcoming: async () => [],
      createEntry: async () => ({
        id: 'entry-1',
        title: 'mock',
        notes: null,
        date: '2026-04-01',
        startTime: null,
        allDay: true,
        status: 'planned',
        source: 'manual',
        linkedBlockId: null,
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      updateEntry: async () => ({
        id: 'entry-1',
        title: 'mock',
        notes: null,
        date: '2026-04-01',
        startTime: null,
        allDay: true,
        status: 'planned',
        source: 'manual',
        linkedBlockId: null,
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      removeEntry: async () => undefined,
      acceptSuggestion: async () => ({
        id: 'entry-1',
        title: 'mock',
        notes: null,
        date: '2026-04-01',
        startTime: null,
        allDay: true,
        status: 'planned',
        source: 'ai-accepted',
        linkedBlockId: 'block-1',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      dismissSuggestion: async () => undefined,
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
    data: {
      getOverview: async () => ({
        dataDirectory: '/tmp',
        databasePath: '/tmp/changbu.sqlite3',
        settingsDirectory: '/tmp/settings',
        settingsFilePath: '/tmp/settings/settings.json',
        totalBlockCount: 1,
        totalNotebookCount: 1,
        totalSnapshotCount: 0,
        totalAttachmentCount: 0,
        totalVectorCount: 1,
        vectorReady: true,
        aiConfigured: false,
        activeAiMode: 'mock',
        vectorDimension: 4,
        vectorSchemaReady: true,
        failedVectorCount: 0,
        pendingVectorCount: 0,
        vectorQueueProcessing: false,
        tokenUsage: null,
      }),
      cleanupOrphanAttachments: async () => ({ removedCount: 0 }),
      rebuildAttachmentIndex: async () => ({
        indexedBlockCount: 1,
        attachmentCount: 0,
        removedOrphanCount: 0,
      }),
      rebuildAllVectors: async () => ({ queuedBlockCount: 1 }),
      setBackgroundProcessingPaused: async (paused) => ({ paused }),
      clearPendingVectors: async () => 0,
      clearFailedVectors: async () => 0,
    },
    review: {
      openWindow: async () => undefined,
      generateDaily: async () => ({
        date: '2026-04-01',
        title: '每日回顾 2026-04-01',
        summary: 'mock review',
        content: 'mock review',
        blockIds: [],
        calendarEntryIds: [],
        blockCount: 0,
        plannedEntryCount: 0,
        doneEntryCount: 0,
        canceledEntryCount: 0,
        topTags: [],
        generatedAt: '2026-04-01T09:00:00.000Z',
        mode: 'mock',
        sourceBlocks: [],
        empty: true,
      }),
      generateInsight: async () => ({
        methodId: 'default-insight',
        date: '2026-04-01',
        rangeStart: '2026-03-19',
        rangeEnd: '2026-04-01',
        title: 'AI 洞察｜默认洞察｜2026-03-19～2026-04-01',
        summary: 'mock insight',
        content: 'mock insight',
        blockIds: [],
        calendarEntryIds: [],
        blockCount: 0,
        plannedEntryCount: 0,
        doneEntryCount: 0,
        canceledEntryCount: 0,
        topTags: [],
        generatedAt: '2026-04-01T09:00:00.000Z',
        mode: 'mock',
        sourceBlocks: [],
        empty: true,
      }),
      listInsightHistory: async () => [],
      startDailyGeneration: async () => ({
        requestId: 'review-request-1',
        kind: 'daily-review',
        date: '2026-04-01',
        mode: 'mock',
      }),
      startInsightGeneration: async () => ({
        requestId: 'review-request-2',
        kind: 'ai-insight',
        date: '2026-04-01',
        methodId: 'default-insight',
        mode: 'mock',
      }),
      saveDailySnapshot: async () => ({
        id: 'snapshot-1',
        topic: '每日回顾 2026-04-01',
        content: '# 每日回顾 2026-04-01',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      saveInsightSnapshot: async () => ({
        id: 'snapshot-2',
        topic: 'AI 洞察｜默认洞察｜2026-03-19～2026-04-01',
        content: '# AI 洞察｜默认洞察｜2026-03-19～2026-04-01',
        blockIds: [],
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
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
        llmMultimodalOk: false,
        resolvedBaseUrl: 'https://api.example.com',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 4,
        chatModel: 'gpt-4o-mini',
        checkedAt: '2026-04-01T09:00:00.000Z',
      }),
      openWindow: async () => undefined,
      openDataDirectory: async () => undefined,
      openSettingsDirectory: async () => undefined,
      getExternalAccessStatus: async () => ({
        enabled: false,
        available: false,
        generatedAt: null,
        skillTarget: 'claude-code',
        cliPath: '/tmp/external-access/changbu-notes',
        cliDirectory: '/tmp/external-access',
        guidesDirectory: '/tmp/external-access/guides',
        integrationReadmePath: '/tmp/external-access/README.md',
        integrationReadmeExists: false,
        agentGuidePath: '/tmp/external-access/guides/AGENTS.md',
        agentGuideExists: false,
        commandsGuidePath: '/tmp/external-access/guides/commands.md',
        workflowsGuidePath: '/tmp/external-access/guides/workflows.md',
        examplesDirectory: '/tmp/external-access/examples',
        adaptersDirectory: '/tmp/external-access/adapters',
        skillDirectory: '/tmp/external-access/adapters/claude-code/changbu-notes',
        executablePath: '/tmp/changbu',
        executableExists: false,
        cliExists: false,
        skillExists: false,
        doctorCommand: "'/tmp/external-access/changbu-notes' doctor --json",
        searchCommandExample: "'/tmp/external-access/changbu-notes' search \"服务器信息\" --limit 5 --json",
        issues: ['外部接入未启用。'],
      }),
      enableExternalAccess: async () => ({
        enabled: true,
        available: false,
        generatedAt: null,
        skillTarget: 'claude-code',
        cliPath: '/tmp/external-access/changbu-notes',
        cliDirectory: '/tmp/external-access',
        guidesDirectory: '/tmp/external-access/guides',
        integrationReadmePath: '/tmp/external-access/README.md',
        integrationReadmeExists: false,
        agentGuidePath: '/tmp/external-access/guides/AGENTS.md',
        agentGuideExists: false,
        commandsGuidePath: '/tmp/external-access/guides/commands.md',
        workflowsGuidePath: '/tmp/external-access/guides/workflows.md',
        examplesDirectory: '/tmp/external-access/examples',
        adaptersDirectory: '/tmp/external-access/adapters',
        skillDirectory: '/tmp/external-access/adapters/claude-code/changbu-notes',
        executablePath: '/tmp/changbu',
        executableExists: true,
        cliExists: false,
        skillExists: false,
        doctorCommand: "'/tmp/external-access/changbu-notes' doctor --json",
        searchCommandExample: "'/tmp/external-access/changbu-notes' search \"服务器信息\" --limit 5 --json",
        issues: ['本地 CLI 包装脚本还没有生成。'],
      }),
      generateExternalAccessBundle: async () => ({
        enabled: true,
        available: true,
        generatedAt: '2026-04-01T09:00:00.000Z',
        skillTarget: 'claude-code',
        cliPath: '/tmp/external-access/changbu-notes',
        cliDirectory: '/tmp/external-access',
        guidesDirectory: '/tmp/external-access/guides',
        integrationReadmePath: '/tmp/external-access/README.md',
        integrationReadmeExists: true,
        agentGuidePath: '/tmp/external-access/guides/AGENTS.md',
        agentGuideExists: true,
        commandsGuidePath: '/tmp/external-access/guides/commands.md',
        workflowsGuidePath: '/tmp/external-access/guides/workflows.md',
        examplesDirectory: '/tmp/external-access/examples',
        adaptersDirectory: '/tmp/external-access/adapters',
        skillDirectory: '/tmp/external-access/adapters/claude-code/changbu-notes',
        executablePath: '/tmp/changbu',
        executableExists: true,
        cliExists: true,
        skillExists: true,
        doctorCommand: "'/tmp/external-access/changbu-notes' doctor --json",
        searchCommandExample: "'/tmp/external-access/changbu-notes' search \"服务器信息\" --limit 5 --json",
        issues: [],
      }),
      setupExternalAccess: async () => ({
        enabled: true,
        available: true,
        generatedAt: '2026-04-01T09:00:00.000Z',
        skillTarget: 'claude-code',
        cliPath: '/tmp/external-access/changbu-notes',
        cliDirectory: '/tmp/external-access',
        guidesDirectory: '/tmp/external-access/guides',
        integrationReadmePath: '/tmp/external-access/README.md',
        integrationReadmeExists: true,
        agentGuidePath: '/tmp/external-access/guides/AGENTS.md',
        agentGuideExists: true,
        commandsGuidePath: '/tmp/external-access/guides/commands.md',
        workflowsGuidePath: '/tmp/external-access/guides/workflows.md',
        examplesDirectory: '/tmp/external-access/examples',
        adaptersDirectory: '/tmp/external-access/adapters',
        skillDirectory: '/tmp/external-access/adapters/claude-code/changbu-notes',
        executablePath: '/tmp/changbu',
        executableExists: true,
        cliExists: true,
        skillExists: true,
        doctorCommand: "'/tmp/external-access/changbu-notes' doctor --json",
        searchCommandExample: "'/tmp/external-access/changbu-notes' search \"服务器信息\" --limit 5 --json",
        issues: [],
      }),
      disableExternalAccess: async () => ({
        enabled: false,
        available: false,
        generatedAt: '2026-04-01T09:00:00.000Z',
        skillTarget: 'claude-code',
        cliPath: '/tmp/external-access/changbu-notes',
        cliDirectory: '/tmp/external-access',
        guidesDirectory: '/tmp/external-access/guides',
        integrationReadmePath: '/tmp/external-access/README.md',
        integrationReadmeExists: true,
        agentGuidePath: '/tmp/external-access/guides/AGENTS.md',
        agentGuideExists: true,
        commandsGuidePath: '/tmp/external-access/guides/commands.md',
        workflowsGuidePath: '/tmp/external-access/guides/workflows.md',
        examplesDirectory: '/tmp/external-access/examples',
        adaptersDirectory: '/tmp/external-access/adapters',
        skillDirectory: '/tmp/external-access/adapters/claude-code/changbu-notes',
        executablePath: '/tmp/changbu',
        executableExists: true,
        cliExists: true,
        skillExists: true,
        doctorCommand: "'/tmp/external-access/changbu-notes' doctor --json",
        searchCommandExample: "'/tmp/external-access/changbu-notes' search \"服务器信息\" --limit 5 --json",
        issues: ['外部接入未启用。'],
      }),
      openExternalAccessDirectory: async () => undefined,
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
        modelCallCounts: {
          llm: 0,
          embedding: 0,
        },
        tokenUsage: null,
        lifetimeTokenUsage: null,
        failedVectorCount: 0,
        pendingVectorCount: 0,
        vectorQueueProcessing: false,
      }),
    },
    vectors: {
      retryFailed: async () => 0,
    },
    events: {
      onBatch(listener) {
        batchListeners.add(listener)
        return () => {
          batchListeners.delete(listener)
        }
      },
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
      onCalendarChanged(listener) {
        calendarListeners.add(listener)
        return () => {
          calendarListeners.delete(listener)
        }
      },
      onDocGenerationChunk() {
        return () => undefined
      },
      onReviewGenerationChunk() {
        return () => undefined
      },
      onQuitStateChanged() {
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
      const batch: AppEventBatch = {
        blockChanges: [{ blockId: event.block.id, reason: event.reason }],
        blockPayloads: event.reason === 'deleted' ? {} : { [event.block.id]: event.block },
        notebookChanges: [],
        metaChanges: [],
        calendarChanges: [],
      }

      for (const listener of batchListeners) {
        listener(batch)
      }

      for (const listener of blockListeners) {
        listener(event)
      }
    },
    emitNotebooksChanged(event: NotebookChangedEvent) {
      const batch: AppEventBatch = {
        blockChanges: [],
        blockPayloads: {},
        notebookChanges: [event],
        metaChanges: [],
        calendarChanges: [],
      }

      for (const listener of batchListeners) {
        listener(batch)
      }

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
