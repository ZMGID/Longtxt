// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLiveEmbeddingProvider, createLiveLLMProvider, probeAiConfig, resolveBaseUrl } from '../services/ai'

const liveConfig = {
  llm: {
    endpoint: 'https://api.example.com/v1',
    apiKey: 'llm-key',
    model: 'gpt-4o-mini',
  },
  embedding: {
    endpoint: 'https://api.example.com/v1',
    apiKey: 'embedding-key',
    model: 'text-embedding-3-small',
  },
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

describe('live ai services', () => {
  it('normalizes siliconflow root endpoint to /v1', () => {
    expect(resolveBaseUrl('https://api.siliconflow.cn')).toBe('https://api.siliconflow.cn/v1')
    expect(resolveBaseUrl('https://api.siliconflow.cn/v1')).toBe('https://api.siliconflow.cn/v1')
  })

  it('parses embeddings response', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof global.fetch

    const provider = createLiveEmbeddingProvider(liveConfig)
    const embeddings = await provider.embed(['长布'])

    expect(embeddings).toEqual([[0.1, 0.2, 0.3]])
  })

  it('streams chat completion chunks from sse', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    global.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      }),
    ) as typeof global.fetch

    const provider = createLiveLLMProvider(liveConfig)
    let output = ''

    for await (const chunk of provider.streamDocument('测试主题', [])) {
      output += chunk
    }

    expect(output).toBe('你好，世界')
  })

  it('maps provider errors into user-readable test results', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4o-mini' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'invalid api key',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ) as typeof global.fetch

    const result = await probeAiConfig(liveConfig)

    expect(result.success).toBe(false)
    expect(result.modelsOk).toBe(true)
    expect(result.embeddingOk).toBe(true)
    expect(result.llmOk).toBe(false)
    expect(result.error).toContain('LLM 检测失败')
  })

  it('returns staged success details for a full probe', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4o-mini' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        }),
      ) as typeof global.fetch

    const result = await probeAiConfig(liveConfig)

    expect(result.success).toBe(true)
    expect(result.modelsOk).toBe(true)
    expect(result.embeddingOk).toBe(true)
    expect(result.llmOk).toBe(true)
    expect(result.llmStreamingOk).toBe(true)
    expect(result.embeddingDimension).toBe(4)
    expect(result.resolvedBaseUrl).toBe('https://api.example.com/v1')
  })

  it('probes llm and embedding models against their own providers', async () => {
    const mixedConfig = {
      llm: {
        endpoint: 'https://api.deepseek.com',
        apiKey: 'deepseek-key',
        model: 'deepseek-chat',
      },
      embedding: {
        endpoint: 'https://api.siliconflow.cn',
        apiKey: 'siliconflow-key',
        model: 'BAAI/bge-m3',
      },
    }
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'BAAI/bge-m3' }, { id: 'Qwen/Qwen3-Embedding-8B' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        }),
      ) as typeof global.fetch

    const result = await probeAiConfig(mixedConfig)

    expect(result.success).toBe(true)
    expect(result.modelsOk).toBe(true)
    expect(result.embeddingOk).toBe(true)
    expect(result.llmOk).toBe(true)
    expect(result.llmStreamingOk).toBe(true)
  })
})
