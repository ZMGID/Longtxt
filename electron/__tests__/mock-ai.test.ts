// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createLiveLLMProvider, createMockEmbeddingProvider, createMockLLMProvider } from '../services/ai'
import { createTaggerEngine } from '../services/tagger'

describe('mock ai services', () => {
  it('returns stable tags for known content', async () => {
    const tagger = createTaggerEngine()
    const result = await tagger.assign('React 前端页面需要连接 SQLite 与 AI 搜索', {
      corpusContents: ['React 前端页面需要连接 SQLite 与 AI 搜索'],
    })
    const tags = [...result.categories, ...result.detailTags]

    expect(tags).toContain('前端')
    expect(tags).toContain('数据库')
    expect(tags).toContain('AI')
  })

  it('does not classify technical integration notes as diary', async () => {
    const tagger = createTaggerEngine()
    const result = await tagger.assign('今天继续测试长布接入 SiliconFlow，重点验证 embedding 维度、自动标签和文档生成是否走 live。', {
      corpusContents: ['今天继续测试长布接入 SiliconFlow，重点验证 embedding 维度、自动标签和文档生成是否走 live。'],
    })

    const tags = [...result.categories, ...result.detailTags]
    expect(tags).toContain('AI')
    expect(tags).toContain('项目')
    expect(tags).not.toContain('日记')
  })

  it('uses llm fallback for low-confidence content', async () => {
    const liveLlmProvider = {
      streamDocument: vi.fn(),
      streamDailyReview: vi.fn(),
      streamAiInsight: vi.fn(),
      suggestTags: vi.fn().mockResolvedValue({ categories: ['工作'], detailTags: ['项目', '新方向'] }),
      suggestTagsBatch: vi.fn().mockResolvedValue([{ categories: ['工作'], detailTags: ['项目', '新方向'], summary: null }]),
      extractCalendarSuggestions: vi.fn().mockResolvedValue([]),
      generateDailyReview: vi.fn().mockResolvedValue('mock daily review'),
      generateAiInsight: vi.fn().mockResolvedValue('mock ai insight'),
    }
    const tagger = createTaggerEngine()
    const result = await tagger.assign('这段内容比较抽象，像是在摸索一个还没成形的方向。', {
      corpusContents: ['这段内容比较抽象，像是在摸索一个还没成形的方向。'],
      liveLlmProvider,
    })

    expect(result.usedFallback).toBe(false)
    expect(liveLlmProvider.suggestTagsBatch).toHaveBeenCalled()
    expect(result.categories).toContain('工作')
    expect(result.detailTags).toContain('项目')
  })

  it('prefers ai-generated tags over rule-only result in live mode', async () => {
    const liveLlmProvider = {
      streamDocument: vi.fn(),
      streamDailyReview: vi.fn(),
      streamAiInsight: vi.fn(),
      suggestTags: vi.fn().mockResolvedValue({ categories: ['工作'], detailTags: ['项目', '进度'] }),
      suggestTagsBatch: vi.fn().mockResolvedValue([{ categories: ['工作'], detailTags: ['项目', '进度'], summary: null }]),
      extractCalendarSuggestions: vi.fn().mockResolvedValue([]),
      generateDailyReview: vi.fn().mockResolvedValue('mock daily review'),
      generateAiInsight: vi.fn().mockResolvedValue('mock ai insight'),
    }
    const tagger = createTaggerEngine()
    const result = await tagger.assign('今天继续测试长布接入 SiliconFlow，重点验证 embedding 维度、自动标签和文档生成是否走 live。', {
      corpusContents: ['今天继续测试长布接入 SiliconFlow，重点验证 embedding 维度、自动标签和文档生成是否走 live。'],
      liveLlmProvider,
    })

    expect(result.categories).toEqual(['工作'])
    expect(result.detailTags).toEqual(['项目', '进度'])
    expect(result.usedFallback).toBe(false)
  })

  it('returns deterministic embedding shape', async () => {
    const embeddingProvider = createMockEmbeddingProvider()
    const [vector] = await embeddingProvider.embed(['changbu'])

    expect(vector).toHaveLength(1536)
    expect(vector[0]).toBeGreaterThanOrEqual(0)
  })

  it('streams a mock document in chunks', async () => {
    const provider = createMockLLMProvider('mock')
    let output = ''

    for await (const chunk of provider.streamDocument('MVP 骨架', [])) {
      output += chunk
    }

    expect(output).toContain('模拟')
    expect(output).toContain('MVP 骨架')
  })

  it('generates a readable mock daily review', async () => {
    const provider = createMockLLMProvider('mock')
    const content = await provider.generateDailyReview({
      date: '2026-04-08',
      blockCount: 2,
      plannedEntryCount: 1,
      doneEntryCount: 1,
      canceledEntryCount: 0,
      topTags: ['项目', '服务器'],
      blocks: [
        {
          id: 'block-1',
          createdAt: '2026-04-08T09:00:00.000Z',
          preview: '上午处理发布收尾',
          content: '上午处理发布收尾，补齐回滚说明。',
          summary: null,
          tags: ['项目'],
        },
      ],
      entries: [
        {
          id: 'entry-1',
          title: '服务器巡检',
          notes: null,
          startTime: '15:00',
          allDay: false,
          status: 'done',
        },
      ],
    })

    expect(content).toContain('2026-04-08')
    expect(content).toContain('服务器巡检')
    expect(content).toContain('发布收尾')
  })

  it('generates distinct mock ai insights for different methods', async () => {
    const provider = createMockLLMProvider('mock')

    const reverseInsight = await provider.generateAiInsight({
      methodId: 'reverse-thinking',
      methodLabel: '逆向思考',
      promptPreset: '如果要让接下来更糟，会延续哪些模式？',
      anchorDate: '2026-04-08',
      rangeStart: '2026-03-26',
      rangeEnd: '2026-04-08',
      blockCount: 3,
      plannedEntryCount: 1,
      doneEntryCount: 2,
      canceledEntryCount: 0,
      topTags: ['项目', '服务器'],
      dayDigests: [
        {
          date: '2026-04-07',
          blockCount: 2,
          topTags: ['项目'],
          previews: ['补回滚说明', '巡检服务器'],
          plannedEntryCount: 1,
          doneEntryCount: 1,
          canceledEntryCount: 0,
        },
      ],
      blocks: [
        {
          id: 'block-1',
          date: '2026-04-08',
          createdAt: '2026-04-08T09:00:00.000Z',
          preview: '上午处理发布收尾',
          content: '上午处理发布收尾，补齐回滚说明。',
          summary: null,
          tags: ['项目'],
        },
      ],
      entries: [
        {
          id: 'entry-1',
          date: '2026-04-08',
          title: '服务器巡检',
          notes: null,
          startTime: '15:00',
          allDay: false,
          status: 'done',
        },
      ],
    })

    const mbtiInsight = await provider.generateAiInsight({
      methodId: 'mbti-analysis',
      methodLabel: 'MBTI 分析',
      promptPreset: '只描述偏好，不下人格定论。',
      anchorDate: '2026-04-08',
      rangeStart: '2026-03-26',
      rangeEnd: '2026-04-08',
      blockCount: 3,
      plannedEntryCount: 1,
      doneEntryCount: 2,
      canceledEntryCount: 0,
      topTags: ['项目', '服务器'],
      dayDigests: [
        {
          date: '2026-04-07',
          blockCount: 2,
          topTags: ['项目'],
          previews: ['补回滚说明', '巡检服务器'],
          plannedEntryCount: 1,
          doneEntryCount: 1,
          canceledEntryCount: 0,
        },
      ],
      blocks: [
        {
          id: 'block-1',
          date: '2026-04-08',
          createdAt: '2026-04-08T09:00:00.000Z',
          preview: '上午处理发布收尾',
          content: '上午处理发布收尾，补齐回滚说明。',
          summary: null,
          tags: ['项目'],
        },
      ],
      entries: [
        {
          id: 'entry-1',
          date: '2026-04-08',
          title: '服务器巡检',
          notes: null,
          startTime: '15:00',
          allDay: false,
          status: 'done',
        },
      ],
    })

    expect(reverseInsight).toContain('如果要让接下来更糟')
    expect(mbtiInsight).toContain('工作偏好')
    expect(reverseInsight).not.toEqual(mbtiInsight)
  })

  it('sanitizes live llm tag output to valid JSON tags', async () => {
    const originalFetch = global.fetch
    const provider = createLiveLLMProvider({
      llm: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'gpt-4o-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'text-embedding-3-small',
      },
    })

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"categories":["工作"],"detail_tags":["项目","项目","自定义标签"]}\n```',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    ) as typeof global.fetch

    const tags = await provider.suggestTags({
      content: '想做一个项目',
      categoryCandidates: ['工作', '生活'],
      detailCandidates: ['项目', '想法'],
      userTags: [],
    })

    global.fetch = originalFetch

    expect(tags).toEqual({
      categories: ['工作'],
      detailTags: ['项目', '自定义标签'],
      summary: null,
    })
  })

  it('sanitizes live llm batch tag output to valid JSON tags', async () => {
    const originalFetch = global.fetch
    const provider = createLiveLLMProvider({
      llm: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'gpt-4o-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'text-embedding-3-small',
      },
    })

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"items":[{"index":0,"categories":["工作"],"detail_tags":["项目","项目"],"summary":"项目记录"},{"index":1,"categories":["技术"],"detail_tags":["Electron"],"summary":"Electron 记录"}]}\n```',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    ) as typeof global.fetch

    const tags = await provider.suggestTagsBatch([
      {
        content: '想做一个项目',
        categoryCandidates: ['工作', '生活'],
        detailCandidates: ['项目', '想法'],
        userTags: [],
      },
      {
        content: '继续排查 Electron 窗口事件',
        categoryCandidates: ['技术', '工作'],
        detailCandidates: ['Electron', 'IPC'],
        userTags: [],
      },
    ])

    global.fetch = originalFetch

    expect(tags).toEqual([
      {
        categories: ['工作'],
        detailTags: ['项目'],
        summary: '项目记录',
      },
      {
        categories: ['技术'],
        detailTags: ['Electron'],
        summary: 'Electron 记录',
      },
    ])
  })
})
