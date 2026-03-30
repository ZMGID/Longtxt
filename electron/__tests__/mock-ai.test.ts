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
      suggestTags: vi.fn().mockResolvedValue({ categories: ['工作'], detailTags: ['项目', '新方向'] }),
    }
    const tagger = createTaggerEngine()
    const result = await tagger.assign('这段内容比较抽象，像是在摸索一个还没成形的方向。', {
      corpusContents: ['这段内容比较抽象，像是在摸索一个还没成形的方向。'],
      liveLlmProvider,
    })

    expect(result.usedFallback).toBe(false)
    expect(liveLlmProvider.suggestTags).toHaveBeenCalled()
    expect(result.categories).toContain('工作')
    expect(result.detailTags).toContain('项目')
  })

  it('prefers ai-generated tags over rule-only result in live mode', async () => {
    const liveLlmProvider = {
      streamDocument: vi.fn(),
      suggestTags: vi.fn().mockResolvedValue({ categories: ['工作'], detailTags: ['项目', '进度'] }),
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
})
