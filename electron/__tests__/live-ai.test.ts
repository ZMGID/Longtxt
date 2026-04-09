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
  multimodalImageAnalysisEnabled: false,
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

  it('localizes probe errors to english when requested', async () => {
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

    const result = await probeAiConfig(liveConfig, 'en')

    expect(result.success).toBe(false)
    expect(result.modelsOk).toBe(true)
    expect(result.embeddingOk).toBe(true)
    expect(result.llmOk).toBe(false)
    expect(result.error).toContain('LLM check failed')
    expect(result.error).toContain('LLM request failed')
    expect(result.error).toContain('invalid api key')
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

  it('probes multimodal capability when enabled', async () => {
    const multimodalConfig = {
      ...liveConfig,
      multimodalImageAnalysisEnabled: true,
    }
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const fetchMock = vi
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    global.fetch = fetchMock as typeof global.fetch

    const result = await probeAiConfig(multimodalConfig)

    expect(result.success).toBe(true)
    expect(result.llmMultimodalOk).toBe(true)

    const multimodalRequest = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body)) as {
      messages: Array<{ content: unknown }>
    }
    expect(multimodalRequest.messages[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: expect.stringContaining('data:image/png;base64,'),
          }),
        }),
      ]),
    )
  })

  it('keeps text capabilities available when multimodal probing only hits a capability error', async () => {
    const multimodalConfig = {
      ...liveConfig,
      multimodalImageAnalysisEnabled: true,
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'This model does not support image_url content.',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ) as typeof global.fetch

    const result = await probeAiConfig(multimodalConfig)

    expect(result.success).toBe(true)
    expect(result.llmMultimodalOk).toBe(false)
    expect(result.error).toBeUndefined()
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
      multimodalImageAnalysisEnabled: false,
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

  it('falls back to text-only tagging when multimodal requests are rejected', async () => {
    const provider = createLiveLLMProvider({
      ...liveConfig,
      multimodalImageAnalysisEnabled: true,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'This model does not support image input.',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"categories":["技术"],"detail_tags":["截图"],"summary":"图片回退摘要"}',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    global.fetch = fetchMock as typeof global.fetch

    const result = await provider.suggestTags({
      content: '请分析这张截图',
      categoryCandidates: ['技术', '工作'],
      detailCandidates: ['截图', '图片'],
      userTags: [],
      images: [
        {
          index: 0,
          url: 'https://example.com/screenshot.png',
          altText: '运行报错截图',
          mimeType: 'image/png',
        },
      ],
      skippedImages: 1,
    })

    expect(result).toEqual({
      categories: ['技术'],
      detailTags: ['截图'],
      imageAnnotations: [],
      summary: '图片回退摘要',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const multimodalBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: unknown }>
    }
    expect(multimodalBody.messages[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: 'https://example.com/screenshot.png' },
        }),
      ]),
    )

    const fallbackBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ content: unknown }>
    }
    expect(fallbackBody.messages[0]?.content).toEqual(expect.stringContaining('本次图片未被实际分析'))
    expect(fallbackBody.messages[1]?.content).toEqual(expect.stringContaining('本次只能依据图片 alt / URL / 上下文推断'))
  })
})
