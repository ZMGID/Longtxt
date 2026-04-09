import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type {
  AiInsightResult,
  AppEventBatch,
  AppMeta,
  Block,
  CalendarDayDetail,
  CalendarHeatmap,
  ChangbuApi,
  DailyReviewResult,
} from '../../shared/types'
import { useBlockCleanupDays } from '../hooks/useBlockCleanupDays'
import { useCalendarDayDetail, useCalendarHeatmap } from '../hooks/useCalendar'
import { useBlocksByDate } from '../hooks/useBlocksByDate'
import { useAiInsight, useDailyReview } from '../hooks/useReview'
import { ChangbuEventBridge } from './ChangbuEventBridge'

function createBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: overrides.id ?? 'block-1',
    content: overrides.content ?? '默认内容',
    summary: overrides.summary ?? null,
    imageAnnotations: overrides.imageAnnotations ?? [],
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T09:00:00.000Z',
    status: overrides.status ?? 'ready',
    aiMode: overrides.aiMode ?? 'mock',
    errorMessage: overrides.errorMessage ?? null,
  }
}

function createDailyReviewResult(date: string): DailyReviewResult {
  return {
    date,
    title: `Daily ${date}`,
    summary: null,
    content: `Daily review for ${date}`,
    blockIds: [],
    calendarEntryIds: [],
    blockCount: 0,
    plannedEntryCount: 0,
    doneEntryCount: 0,
    canceledEntryCount: 0,
    topTags: [],
    generatedAt: '2026-04-01T10:00:00.000Z',
    mode: 'mock',
    sourceBlocks: [],
    empty: false,
  }
}

function createInsightResult(date: string): AiInsightResult {
  return {
    methodId: 'default-insight',
    date,
    rangeStart: '2026-04-01',
    rangeEnd: date,
    title: `Insight ${date}`,
    summary: null,
    content: `Insight for ${date}`,
    blockIds: [],
    calendarEntryIds: [],
    blockCount: 0,
    plannedEntryCount: 0,
    doneEntryCount: 0,
    canceledEntryCount: 0,
    topTags: [],
    generatedAt: '2026-04-01T10:00:00.000Z',
    mode: 'mock',
    sourceBlocks: [],
    empty: false,
  }
}

function createMeta(): AppMeta {
  return {
    dataDirectory: '/tmp/changbu-test',
    totalBlockCount: 1,
    vectorReady: true,
    aiConfigured: false,
    resolvedBaseUrl: null,
    vectorDimension: null,
    vectorSchemaReady: true,
    activeAiMode: 'mock',
    lastAiError: null,
    lastAiTestResult: null,
    modelCallCounts: { llm: 0, embedding: 0 },
    tokenUsage: null,
    lifetimeTokenUsage: null,
    failedVectorCount: 0,
    pendingVectorCount: 0,
    vectorQueueProcessing: false,
  }
}

function createEventBridgeApiMock() {
  const batchListeners = new Set<(batch: AppEventBatch) => void>()
  let blocksByDate = [createBlock()]
  let dailyDetail: CalendarDayDetail = {
    date: '2026-04-01',
    blockCount: 1,
    blocks: blocksByDate,
    entries: [],
    suggestions: [],
  }
  let heatmap: CalendarHeatmap = {
    year: 2026,
    totalContributions: 1,
    maxBlockCount: 1,
    days: [{
      date: '2026-04-01',
      blockCount: 1,
      intensityLevel: 1,
      hasEntries: false,
      hasSuggestions: false,
    }],
  }
  let totalBlockCount = 1

  const api = {
    blocks: {
      create: async () => createBlock(),
      get: async () => createBlock(),
      getMany: async () => [],
      getContext: async () => [],
      list: async () => ({ items: [], nextCursor: null, hasMore: false }),
      listByDate: vi.fn(async () => blocksByDate),
      update: async () => createBlock(),
      remove: async () => undefined,
      removeMany: async () => ({ removed: 0, removedIds: [] }),
      findRelated: async () => [],
    },
    attachments: {
      saveImage: async () => ({ fileUrl: 'file:///tmp/mock.png', markdownAlt: 'mock' }),
    },
    graph: {
      getData: vi.fn(async () => ({ nodes: [], edges: [] })),
    },
    search: {
      blocks: async () => [],
      byTag: async () => [],
      generate: async () => ({ requestId: 'request-1', topic: 'topic', mode: 'mock', blockIds: [] }),
    },
    snapshots: {
      save: async () => ({ id: 'snapshot-1', topic: 'topic', content: 'content', blockIds: [], createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z' }),
      update: async () => ({ id: 'snapshot-1', topic: 'topic', content: 'content', blockIds: [], createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z' }),
      list: async () => [],
      get: async () => ({ id: 'snapshot-1', topic: 'topic', content: 'content', blockIds: [], createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z' }),
      remove: async () => undefined,
    },
    calendar: {
      listYears: vi.fn(async () => [2026]),
      getYearHeatmap: vi.fn(async () => heatmap),
      getDayDetail: vi.fn(async () => dailyDetail),
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
        linkedBlockId: null,
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      }),
      dismissSuggestion: async () => undefined,
    },
    notebooks: {
      list: async () => [],
      get: async () => { throw new Error('not implemented') },
      create: async () => { throw new Error('not implemented') },
      update: async () => { throw new Error('not implemented') },
      remove: async () => undefined,
      addBlock: async () => ({ notebook: { id: 'notebook-1', title: 'Notebook', createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z', itemCount: 0, blockCount: 0, structureCount: 0, items: [] }, added: true }),
      removeItem: async () => { throw new Error('not implemented') },
      reorderItems: async () => { throw new Error('not implemented') },
      createBlock: async () => { throw new Error('not implemented') },
      createStructureItem: async () => { throw new Error('not implemented') },
      updateStructureItem: async () => { throw new Error('not implemented') },
      getReferencePreview: async () => { throw new Error('not implemented') },
      updateReferenceReview: async () => { throw new Error('not implemented') },
      generateDocument: async () => ({ requestId: 'request-1', topic: 'topic', mode: 'mock', blockIds: [] }),
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
      getOverview: vi.fn(async () => ({
        dataDirectory: '/tmp/changbu-test',
        databasePath: '/tmp/changbu-test/changbu.sqlite3',
        settingsDirectory: '/tmp/changbu-test/settings',
        settingsFilePath: '/tmp/changbu-test/settings.json',
        totalBlockCount,
        totalNotebookCount: 0,
        totalSnapshotCount: 0,
        totalAttachmentCount: 0,
        totalVectorCount: 0,
        vectorReady: true,
        aiConfigured: false,
        activeAiMode: 'mock',
        vectorDimension: null,
        vectorSchemaReady: true,
        failedVectorCount: 0,
        pendingVectorCount: 0,
        vectorQueueProcessing: false,
        tokenUsage: null,
      })),
      cleanupOrphanAttachments: async () => ({ removedCount: 0 }),
      rebuildAttachmentIndex: async () => ({ indexedBlockCount: 0, attachmentCount: 0, removedOrphanCount: 0 }),
      rebuildAllVectors: async () => ({ queuedBlockCount: 0 }),
    },
    review: {
      openWindow: async () => undefined,
      generateDaily: vi.fn(async (date: string) => createDailyReviewResult(date)),
      generateInsight: vi.fn(async (_methodId: string, date: string) => createInsightResult(date)),
      listInsightHistory: async () => [],
      startDailyGeneration: async (date: string) => ({ requestId: 'request-1', kind: 'daily-review', date, mode: 'mock' }),
      startInsightGeneration: async (_methodId: string, date: string) => ({ requestId: 'request-1', kind: 'ai-insight', date, mode: 'mock' }),
      saveDailySnapshot: async () => ({ id: 'snapshot-1', topic: 'daily', content: 'content', blockIds: [], createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z' }),
      saveInsightSnapshot: async () => ({ id: 'snapshot-1', topic: 'insight', content: 'content', blockIds: [], createdAt: '2026-04-01T09:00:00.000Z', updatedAt: '2026-04-01T09:00:00.000Z' }),
    },
    tags: {
      add: async () => createBlock(),
      remove: async () => createBlock(),
      list: vi.fn(async () => []),
    },
    settings: {
      get: async () => null,
      set: async () => undefined,
      testApi: async () => ({ success: false, modelsOk: false, embeddingOk: false, llmOk: false, llmStreamingOk: false, llmMultimodalOk: false, resolvedBaseUrl: '', embeddingModel: '', embeddingDimension: null, chatModel: '', checkedAt: '2026-04-01T09:00:00.000Z' }),
      openWindow: async () => undefined,
      openDataDirectory: async () => undefined,
      openSettingsDirectory: async () => undefined,
      getMeta: async () => createMeta(),
      getExternalAccessStatus: async () => ({ enabled: false, available: false, generatedAt: null, skillTarget: 'claude-code', cliPath: '', cliDirectory: '', guidesDirectory: '', integrationReadmePath: '', integrationReadmeExists: false, agentGuidePath: '', agentGuideExists: false, commandsGuidePath: '', workflowsGuidePath: '', examplesDirectory: '', adaptersDirectory: '', skillDirectory: '', executablePath: '', executableExists: false, cliExists: false, skillExists: false, doctorCommand: '', searchCommandExample: '', issues: [] }),
      enableExternalAccess: async () => { throw new Error('not implemented') },
      generateExternalAccessBundle: async () => { throw new Error('not implemented') },
      setupExternalAccess: async () => { throw new Error('not implemented') },
      disableExternalAccess: async () => { throw new Error('not implemented') },
      openExternalAccessDirectory: async () => undefined,
    },
    vectors: {
      retryFailed: async () => 0,
    },
    events: {
      onBatch(listener: (batch: AppEventBatch) => void) {
        batchListeners.add(listener)
        return () => {
          batchListeners.delete(listener)
        }
      },
      onBlockChanged() {
        return () => undefined
      },
      onNotebooksChanged() {
        return () => undefined
      },
      onMetaChanged() {
        return () => undefined
      },
      onCalendarChanged() {
        return () => undefined
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
  } as unknown as ChangbuApi

  window.changbu = api

  return {
    api,
    setBlockState(nextBlocks: Block[]) {
      blocksByDate = nextBlocks
      dailyDetail = {
        ...dailyDetail,
        blockCount: nextBlocks.length,
        blocks: nextBlocks,
      }
      totalBlockCount = nextBlocks.length
      heatmap = {
        ...heatmap,
        totalContributions: nextBlocks.length,
        maxBlockCount: nextBlocks.length,
        days: [{
          date: '2026-04-01',
          blockCount: nextBlocks.length,
          intensityLevel: Math.min(4, nextBlocks.length),
          hasEntries: false,
          hasSuggestions: false,
        }],
      }
    },
    emitBlockEvent(event: { reason: AppEventBatch['blockChanges'][number]['reason']; block: Block }) {
      const batch: AppEventBatch = {
        blockChanges: [{ blockId: event.block.id, reason: event.reason }],
        blockPayloads: { [event.block.id]: event.block },
        notebookChanges: [],
        metaChanges: [],
        calendarChanges: [],
      }

      for (const listener of batchListeners) {
        listener(batch)
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

afterEach(() => {
  window.changbu = undefined as unknown as ChangbuApi
})

describe('ChangbuEventBridge', () => {
  it('patches day caches for tagged events without refetching calendar queries, while refreshing affected review queries', async () => {
    const { api, emitBlockEvent, setBlockState } = createEventBridgeApiMock()
    const wrapper = createWrapper()
    const { result } = renderHook(() => ({
      blocksByDate: useBlocksByDate('2026-04-01'),
      dayDetail: useCalendarDayDetail('2026-04-01'),
      heatmap: useCalendarHeatmap(2026),
      dailyReview: useDailyReview('zh', '2026-04-01', 0),
      insight: useAiInsight('zh', 'default-insight', '2026-04-07', 0),
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.blocksByDate.data?.[0]?.id).toBe('block-1')
      expect(result.current.dayDetail.data?.blockCount).toBe(1)
      expect(result.current.heatmap.data?.totalContributions).toBe(1)
      expect(result.current.dailyReview.data?.date).toBe('2026-04-01')
      expect(result.current.insight.data?.date).toBe('2026-04-07')
    })

    const taggedBlock = createBlock({
      tags: [{ id: 'tag-1', name: '新标签', isDefault: false, source: 'manual', kind: 'user' }],
    })
    setBlockState([taggedBlock])

    act(() => {
      emitBlockEvent({
        reason: 'tagged',
        block: taggedBlock,
      })
    })

    await waitFor(() => {
      expect(result.current.blocksByDate.data?.[0]?.tags.map((tag) => tag.name)).toEqual(['新标签'])
      expect(result.current.dayDetail.data?.blocks[0]?.tags.map((tag) => tag.name)).toEqual(['新标签'])
    })

    expect(api.blocks.listByDate).toHaveBeenCalledTimes(1)
    expect(api.calendar.getDayDetail).toHaveBeenCalledTimes(1)
    expect(api.calendar.getYearHeatmap).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(api.review.generateDaily).toHaveBeenCalledTimes(2)
      expect(api.review.generateInsight).toHaveBeenCalledTimes(2)
    })
  })

  it('refreshes heatmap and cleanup-day queries for created events while patching cached day data in place', async () => {
    const { api, emitBlockEvent, setBlockState } = createEventBridgeApiMock()
    const wrapper = createWrapper()
    const { result } = renderHook(() => ({
      blocksByDate: useBlocksByDate('2026-04-01'),
      dayDetail: useCalendarDayDetail('2026-04-01'),
      heatmap: useCalendarHeatmap(2026),
      cleanupDays: useBlockCleanupDays(),
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.blocksByDate.data).toHaveLength(1)
      expect(result.current.dayDetail.data?.blockCount).toBe(1)
      expect(result.current.heatmap.data?.totalContributions).toBe(1)
      expect(result.current.cleanupDays.data?.[0]?.blockCount).toBe(1)
    })

    const createdBlock = createBlock({
      id: 'block-2',
      createdAt: '2026-04-01T12:00:00.000Z',
    })
    setBlockState([createdBlock, createBlock()])

    act(() => {
      emitBlockEvent({
        reason: 'created',
        block: createdBlock,
      })
    })

    await waitFor(() => {
      expect(result.current.blocksByDate.data?.map((block) => block.id)).toEqual(['block-2', 'block-1'])
      expect(result.current.dayDetail.data?.blockCount).toBe(2)
    })

    expect(api.blocks.listByDate).toHaveBeenCalledTimes(1)
    expect(api.calendar.getDayDetail).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(api.calendar.getYearHeatmap).toHaveBeenCalledTimes(4)
      expect(api.calendar.listYears).toHaveBeenCalledTimes(2)
    })
  })
})
