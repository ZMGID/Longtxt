/**
 * AI 核心模块：配置解析、HTTP 请求层、Provider 工厂与配置探测。
 *
 * 类型定义在 ai-types.ts，消息构建在 ai-messages.ts，
 * 数据净化在 ai-sanitizers.ts，mock 生成在 ai-mocks.ts。
 */
import { createHash } from 'node:crypto'

import type {
  AIConfig,
  AIEndpointConfig,
  AIExecutionMode,
  ApiTestResult,
  AppLanguage,
} from '../../shared/types'
import {
  DEFAULT_MOCK_EMBEDDING_DIMENSION,
  type TokenUsageSink,
  type EmbeddingProvider,
  type LLMProvider,
  type TagSuggestionInput,
  type TagSuggestionResult,
  type ChatMessage,
  type LLMCompletionOptions,
} from './ai-types'
export type {
  TagSuggestionImageInput,
  TagSuggestionBatchOptions,
  CalendarSuggestionExtractionInput,
  CalendarSuggestionExtractionResult,
  DailyReviewGenerationInput,
  AiInsightGenerationInput,
  TokenUsageSink,
  EmbeddingProvider,
  LLMProvider,
} from './ai-types'
export { DEFAULT_MOCK_EMBEDDING_DIMENSION } from './ai-types'
export { sanitizeDailyReviewResponse, sanitizeAiInsightResponse } from './ai-sanitizers'
import { buildDocumentMessages, buildDailyReviewMessages, buildAiInsightMessages, buildTagSuggestionMessages, buildBatchTagSuggestionMessages, buildCalendarSuggestionMessages, buildMultimodalProbeMessages } from './ai-messages'
import { extractJsonObject, sanitizeStructuredTags, sanitizeStructuredTagBatch, sanitizeStructuredCalendarSuggestions, splitTagSuggestionInputsIntoBatches, sanitizeDailyReviewResponse, sanitizeAiInsightResponse } from './ai-sanitizers'
import { textToVector, chunkText, buildMockDocument, buildMockDailyReview, buildMockAiInsight } from './ai-mocks'

const EMBEDDING_TIMEOUT_MS = 30_000
const CHAT_TIMEOUT_MS = 90_000

// ── OpenAI 兼容层内部类型 ────────────────────────────────

interface OpenAICompatibleModelListResponse {
  data?: Array<{ id?: string }>
  error?: {
    message?: string
  }
}

interface OpenAICompatibleEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>
  usage?: {
    prompt_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

interface OpenAICompatibleChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string | null
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

interface OpenAICompatibleChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

interface ResolvedAIConfig {
  llm: AIEndpointConfig & { resolvedBaseUrl: string }
  embedding: AIEndpointConfig & { resolvedBaseUrl: string }
}

// ── URL 与配置工具 ───────────────────────────────────────

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function resolveBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim()

  if (!trimmed) {
    return ''
  }

  const url = new URL(trimmed)
  const normalizedPath = trimTrailingSlash(url.pathname)

  if (url.hostname === 'api.siliconflow.cn' && (!normalizedPath || normalizedPath === '')) {
    return `${url.origin}/v1`
  }

  if (url.hostname === 'api.siliconflow.cn' && normalizedPath === '/v1') {
    return `${url.origin}/v1`
  }

  return normalizedPath ? `${url.origin}${normalizedPath}` : url.origin
}

function buildResolvedConfig(config: AIConfig): ResolvedAIConfig {
  return {
    llm: {
      ...config.llm,
      endpoint: config.llm.endpoint.trim(),
      apiKey: config.llm.apiKey.trim(),
      model: config.llm.model.trim(),
      resolvedBaseUrl: resolveBaseUrl(config.llm.endpoint),
    },
    embedding: {
      ...config.embedding,
      endpoint: config.embedding.endpoint.trim(),
      apiKey: config.embedding.apiKey.trim(),
      model: config.embedding.model.trim(),
      resolvedBaseUrl: resolveBaseUrl(config.embedding.endpoint),
    },
  }
}

export function createConfigFingerprint(config: AIConfig): string {
  let payload: string

  try {
    const resolved = buildResolvedConfig(config)
    payload = JSON.stringify({
      llm: {
        baseUrl: resolved.llm.resolvedBaseUrl,
        model: resolved.llm.model,
        key: resolved.llm.apiKey,
      },
      embedding: {
        baseUrl: resolved.embedding.resolvedBaseUrl,
        model: resolved.embedding.model,
        key: resolved.embedding.apiKey,
      },
      multimodalImageAnalysisEnabled: config.multimodalImageAnalysisEnabled,
    })
  } catch {
    payload = JSON.stringify({
      llm: config.llm,
      embedding: config.embedding,
      multimodalImageAnalysisEnabled: config.multimodalImageAnalysisEnabled,
    })
  }

  return createHash('sha256').update(payload).digest('hex')
}

function buildEndpoint(baseUrl: string, path: 'models' | 'embeddings' | 'chat/completions'): string {
  return new URL(path, `${trimTrailingSlash(baseUrl)}/`).toString()
}

function buildHeaders(config: AIEndpointConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey.trim()}`,
    'Content-Type': 'application/json',
  }
}

// ── 错误处理 ─────────────────────────────────────────────

function isMultimodalCapabilityError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return [
    'image_url',
    'does not support image',
    'does not support multimodal',
    'multimodal',
    'vision',
    'unsupported content type',
    'invalid chat format',
    'input image',
  ].some((pattern) => message.includes(pattern))
}

function extractChatMessageText(response: OpenAICompatibleChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text ?? '')
      .join('')
      .trim()
  }

  return ''
}

function formatProviderError(message: string, details?: string): Error {
  return new Error(details ? `${message}：${details}` : message)
}

function formatLocalizedError(message: string, details: string | null, language: AppLanguage): string {
  if (details) {
    return language === 'en' ? `${message}: ${details}` : `${message}：${details}`
  }

  return language === 'en' ? `${message}.` : `${message}。`
}

function localizeProbeAiDetail(message: string, language: AppLanguage): string {
  if (language !== 'en') {
    return message
  }

  return message
    .replaceAll('请求超时', 'Request timed out')
    .replaceAll('模型列表请求失败：', 'Model list request failed: ')
    .replaceAll('Embedding 请求失败：', 'Embedding request failed: ')
    .replaceAll('Embedding 响应格式无效', 'Embedding response format is invalid')
    .replaceAll('LLM 请求失败：', 'LLM request failed: ')
    .replaceAll('LLM 响应格式无效', 'LLM response format is invalid')
    .replaceAll('LLM 流式请求失败：', 'LLM streaming request failed: ')
    .replaceAll('LLM 流式响应为空', 'LLM streaming response is empty')
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text()

  if (!text) {
    return `${response.status} ${response.statusText}`
  }

  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } }
    return parsed.error?.message ?? text
  } catch {
    return text
  }
}

// ── HTTP 请求 ────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw formatProviderError('请求超时')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function requestModels(config: AIEndpointConfig & { resolvedBaseUrl: string }): Promise<string[]> {
  const response = await fetchWithTimeout(
    buildEndpoint(config.resolvedBaseUrl, 'models'),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    EMBEDDING_TIMEOUT_MS,
  )

  if (!response.ok) {
    throw formatProviderError('模型列表请求失败', await readErrorMessage(response))
  }

  const json = (await response.json()) as OpenAICompatibleModelListResponse
  return (json.data ?? []).map((item) => item.id ?? '').filter(Boolean)
}

async function requestProbeModelLists(
  resolved: ResolvedAIConfig,
): Promise<{ llmModels: string[]; embeddingModels: string[] }> {
  const llmModels = await requestModels(resolved.llm)
  const usesSameCatalog = resolved.llm.resolvedBaseUrl === resolved.embedding.resolvedBaseUrl

  if (usesSameCatalog) {
    return {
      llmModels,
      embeddingModels: llmModels,
    }
  }

  return {
    llmModels,
    embeddingModels: await requestModels(resolved.embedding),
  }
}

async function requestEmbeddings(config: AIEndpointConfig & { resolvedBaseUrl: string }, texts: string[], sink?: TokenUsageSink): Promise<number[][]> {
  sink?.recordRequest('embedding')

  const response = await fetchWithTimeout(
    buildEndpoint(config.resolvedBaseUrl, 'embeddings'),
    {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model.trim(),
        input: texts,
      }),
    },
    EMBEDDING_TIMEOUT_MS,
  )

  if (!response.ok) {
    throw formatProviderError('Embedding 请求失败', await readErrorMessage(response))
  }

  const json = (await response.json()) as OpenAICompatibleEmbeddingResponse
  const vectors = json.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item)) ?? []

  if (vectors.length !== texts.length) {
    throw formatProviderError('Embedding 响应格式无效')
  }

  if (json.usage?.prompt_tokens != null && sink) {
    sink.add(json.usage.prompt_tokens, 0)
  }

  return vectors
}

async function requestChatCompletion(
  config: AIEndpointConfig & { resolvedBaseUrl: string },
  messages: ChatMessage[],
  options: LLMCompletionOptions = {},
  sink?: TokenUsageSink,
): Promise<Response> {
  sink?.recordRequest('llm')

  return fetchWithTimeout(
    buildEndpoint(config.resolvedBaseUrl, 'chat/completions'),
    {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model.trim(),
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 512,
        stream: options.stream ?? false,
      }),
    },
    CHAT_TIMEOUT_MS,
  )
}

async function completeText(
  config: AIEndpointConfig & { resolvedBaseUrl: string },
  messages: ChatMessage[],
  options: LLMCompletionOptions = {},
  sink?: TokenUsageSink,
): Promise<string> {
  const response = await requestChatCompletion(config, messages, {
    ...options,
    stream: false,
  }, sink)

  if (!response.ok) {
    throw formatProviderError('LLM 请求失败', await readErrorMessage(response))
  }

  const json = (await response.json()) as OpenAICompatibleChatCompletionResponse
  const text = extractChatMessageText(json)

  if (!text) {
    throw formatProviderError('LLM 响应格式无效')
  }

  if (json.usage && sink) {
    sink.add(json.usage.prompt_tokens ?? 0, json.usage.completion_tokens ?? 0)
  }

  return text
}

async function* streamChatCompletion(
  config: AIEndpointConfig & { resolvedBaseUrl: string },
  messages: ChatMessage[],
  options: LLMCompletionOptions = {},
  sink?: TokenUsageSink,
): AsyncGenerator<string> {
  const response = await requestChatCompletion(config, messages, {
    ...options,
    stream: true,
  }, sink)

  if (!response.ok) {
    throw formatProviderError('LLM 流式请求失败', await readErrorMessage(response))
  }

  if (!response.body) {
    throw formatProviderError('LLM 流式响应为空')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  /* 流式响应中 usage 可能在多个 chunk 出现，只有最后一个才是全量。
     用"先累加再覆盖"策略：收到新的 usage 时覆盖之前记录的值。 */
  let lastStreamUsage: { prompt: number; completion: number } | null = null

  while (true) {
    const { done, value } = await reader.read()

    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      const lines = event
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }

        const payload = line.slice(5).trim()

        if (!payload || payload === '[DONE]') {
          continue
        }

        const parsed = JSON.parse(payload) as OpenAICompatibleChatCompletionChunk
        const delta = parsed.choices?.[0]?.delta?.content

        if (delta) {
          yield delta
        }

        if (parsed.usage) {
          lastStreamUsage = {
            prompt: parsed.usage.prompt_tokens ?? 0,
            completion: parsed.usage.completion_tokens ?? 0,
          }
        }
      }
    }

    if (done) {
      break
    }
  }

  /* 流结束后，将最终 usage 写入 sink */
  if (lastStreamUsage && sink) {
    sink.add(lastStreamUsage.prompt, lastStreamUsage.completion)
  }
}

// ── Provider 工厂 ────────────────────────────────────────

export function createMockEmbeddingProvider(dimension = DEFAULT_MOCK_EMBEDDING_DIMENSION): EmbeddingProvider {
  return {
    async embed(texts) {
      return texts.map((text) => textToVector(text, dimension))
    },
  }
}

export function createLiveEmbeddingProvider(config: AIConfig, sink?: TokenUsageSink): EmbeddingProvider {
  const resolved = buildResolvedConfig(config)

  return {
    async embed(texts) {
      return requestEmbeddings(resolved.embedding, texts, sink)
    },
  }
}

export function createMockLLMProvider(mode: AIExecutionMode): LLMProvider {
  return {
    async *streamDocument(topic, blocks, context) {
      const prelude = mode === 'live' ? '当前 live provider 不可用，以下内容由模拟编排器生成。\n\n' : '当前未启用真实 AI，以下内容由模拟编排器生成。\n\n'
      const document = `${prelude}${buildMockDocument(topic, blocks, context?.writingGuide)}`

      for (const chunk of chunkText(document, 72)) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        yield chunk
      }
    },

    async *streamDailyReview(input) {
      const prelude = mode === 'live'
        ? input.language === 'en'
          ? 'Live provider is currently unavailable. The following content is generated by the mock formatter.\n\n'
          : '当前 live provider 不可用，以下内容由模拟编排器生成。\n\n'
        : ''
      const content = `${prelude}${buildMockDailyReview(input)}`.trim()

      for (const chunk of chunkText(content, 60)) {
        await new Promise((resolve) => setTimeout(resolve, 18))
        yield chunk
      }
    },

    async *streamAiInsight(input) {
      const prelude = mode === 'live'
        ? input.language === 'en'
          ? 'Live provider is currently unavailable. The following content is generated by the mock formatter.\n\n'
          : '当前 live provider 不可用，以下内容由模拟编排器生成。\n\n'
        : ''
      const content = `${prelude}${buildMockAiInsight(input)}`.trim()

      for (const chunk of chunkText(content, 60)) {
        await new Promise((resolve) => setTimeout(resolve, 18))
        yield chunk
      }
    },

    async suggestTags(input) {
      return {
        categories: [],
        detailTags: input.detailCandidates.slice(0, 3),
        summary: input.content.replace(/\s+/g, ' ').trim().slice(0, 32) || null,
        imageAnnotations: [],
      }
    },

    async suggestTagsBatch(inputs) {
      return inputs.map((input) => ({
        categories: [],
        detailTags: input.detailCandidates.slice(0, 3),
        summary: input.content.replace(/\s+/g, ' ').trim().slice(0, 32) || null,
        imageAnnotations: [],
      }))
    },

    async extractCalendarSuggestions() {
      return []
    },

    async generateDailyReview(input) {
      const prelude = mode === 'live'
        ? input.language === 'en'
          ? 'Live provider is currently unavailable. The following content is generated by the mock formatter.\n\n'
          : '当前 live provider 不可用，以下内容由模拟编排器生成。\n\n'
        : ''
      return `${prelude}${buildMockDailyReview(input)}`.trim()
    },

    async generateAiInsight(input) {
      const prelude = mode === 'live'
        ? input.language === 'en'
          ? 'Live provider is currently unavailable. The following content is generated by the mock formatter.\n\n'
          : '当前 live provider 不可用，以下内容由模拟编排器生成。\n\n'
        : ''
      return `${prelude}${buildMockAiInsight(input)}`.trim()
    },
  }
}

export function createLiveLLMProvider(config: AIConfig, sink?: TokenUsageSink): LLMProvider {
  const resolved = buildResolvedConfig(config)
  const suggestSingleTags = async (input: TagSuggestionInput): Promise<TagSuggestionResult> => {
    const canUseMultimodal = config.multimodalImageAnalysisEnabled && (input.images?.length ?? 0) > 0

    if (canUseMultimodal) {
      try {
        const multimodalMessages = buildTagSuggestionMessages(input, {
          multimodal: true,
          fallbackToTextOnly: false,
        })
        const text = await completeText(resolved.llm, multimodalMessages, {
          temperature: 0,
          maxTokens: 420,
        }, sink)
        const parsed = extractJsonObject(text)
        return sanitizeStructuredTags(parsed, input.categoryCandidates, input.detailCandidates, input.userTags)
      } catch (error) {
        if (!isMultimodalCapabilityError(error)) {
          throw error
        }
      }
    }

    const textOnlyMessages = buildTagSuggestionMessages(input, {
      multimodal: false,
      fallbackToTextOnly: (input.images?.length ?? 0) > 0,
    })
    const text = await completeText(resolved.llm, textOnlyMessages, {
      temperature: 0,
      maxTokens: 260,
    }, sink)
    const parsed = extractJsonObject(text)
    return sanitizeStructuredTags(parsed, input.categoryCandidates, input.detailCandidates, input.userTags)
  }

  return {
    async *streamDocument(topic, blocks, context) {
      const messages = buildDocumentMessages(topic, blocks, context?.writingGuide)

      for await (const chunk of streamChatCompletion(resolved.llm, messages, {
        temperature: context?.temperature ?? 0.1,
        maxTokens: context?.maxTokens ?? 1_200,
      }, sink)) {
        yield chunk
      }
    },

    async *streamDailyReview(input) {
      const messages = buildDailyReviewMessages(input)

      for await (const chunk of streamChatCompletion(resolved.llm, messages, {
        temperature: 0.45,
        maxTokens: 1_500,
      }, sink)) {
        yield chunk
      }
    },

    async *streamAiInsight(input) {
      const messages = buildAiInsightMessages(input)

      for await (const chunk of streamChatCompletion(resolved.llm, messages, {
        temperature: 0.55,
        maxTokens: 1_800,
      }, sink)) {
        yield chunk
      }
    },

    async suggestTags(input) {
      return suggestSingleTags(input)
    },

    async suggestTagsBatch(inputs, options) {
      if (inputs.length === 0) {
        return []
      }

      const batches = splitTagSuggestionInputsIntoBatches(inputs, resolved.llm.model, options)
      const results: TagSuggestionResult[] = []

      for (const batch of batches) {
        if (batch.length === 1) {
          results.push(await suggestSingleTags(batch[0]))
          continue
        }

        const messages = buildBatchTagSuggestionMessages(batch)
        const text = await completeText(resolved.llm, messages, {
          temperature: 0,
          maxTokens: Math.min(1_200, Math.max(360, batch.length * 220)),
        }, sink)
        const parsed = extractJsonObject(text)
        results.push(...sanitizeStructuredTagBatch(parsed, batch))
      }

      return results
    },

    async extractCalendarSuggestions(input) {
      const messages = buildCalendarSuggestionMessages(input)
      const text = await completeText(resolved.llm, messages, {
        temperature: 0,
        maxTokens: Math.min(800, Math.max(220, Math.round((input.maxSuggestions ?? 3) * 180))),
      }, sink)
      const parsed = extractJsonObject(text)
      return sanitizeStructuredCalendarSuggestions(parsed, Math.max(0, Math.round(input.maxSuggestions ?? 3)))
    },

    async generateDailyReview(input) {
      const messages = buildDailyReviewMessages(input)
      const text = await completeText(resolved.llm, messages, {
        temperature: 0.45,
        maxTokens: 1_500,
      }, sink)
      const sanitized = sanitizeDailyReviewResponse(text)

      if (!sanitized) {
        throw formatProviderError(input.language === 'en' ? 'Daily review response is empty' : '每日回顾响应为空')
      }

      return sanitized
    },

    async generateAiInsight(input) {
      const messages = buildAiInsightMessages(input)
      const text = await completeText(resolved.llm, messages, {
        temperature: 0.55,
        maxTokens: 1_800,
      }, sink)
      const sanitized = sanitizeAiInsightResponse(text)

      if (!sanitized) {
        throw formatProviderError(input.language === 'en' ? 'AI insight response is empty' : 'AI 洞察响应为空')
      }

      return sanitized
    },
  }
}

// ── 配置探测 ─────────────────────────────────────────────

export async function probeAiConfig(config: AIConfig, language: AppLanguage = 'zh'): Promise<ApiTestResult> {
  const checkedAt = new Date().toISOString()
  const configFingerprint = createConfigFingerprint(config)
  let resolved: ResolvedAIConfig
  let resolvedBaseUrl = ''

  try {
    resolved = buildResolvedConfig(config)
    resolvedBaseUrl = resolved.llm.resolvedBaseUrl
  } catch (error) {
    return {
      success: false,
      modelsOk: false,
      embeddingOk: false,
      llmOk: false,
      llmStreamingOk: false,
      llmMultimodalOk: false,
      resolvedBaseUrl: config.llm.endpoint.trim() || config.embedding.endpoint.trim(),
      embeddingModel: config.embedding.model.trim(),
      embeddingDimension: null,
      chatModel: config.llm.model.trim(),
      checkedAt,
      configFingerprint,
      error: formatLocalizedError(
        language === 'en' ? 'Address resolution failed' : '地址解析失败',
        error instanceof Error ? error.message : null,
        language,
      ),
    }
  }

  const result: ApiTestResult = {
    success: false,
    modelsOk: false,
    embeddingOk: false,
    llmOk: false,
    llmStreamingOk: false,
    llmMultimodalOk: false,
    resolvedBaseUrl,
    embeddingModel: resolved.embedding.model,
    embeddingDimension: null,
    chatModel: resolved.llm.model,
    checkedAt,
    configFingerprint,
  }

  let availableModels: { llmModels: string[]; embeddingModels: string[] }

  try {
    availableModels = await requestProbeModelLists(resolved)
  } catch (error) {
    return {
      ...result,
      error: formatLocalizedError(
        language === 'en' ? 'Model list check failed' : '模型列表检测失败',
        error instanceof Error ? localizeProbeAiDetail(error.message, language) : null,
        language,
      ),
    }
  }

  const missingModels = [
    availableModels.embeddingModels.includes(resolved.embedding.model)
      ? null
      : language === 'en'
        ? `Embedding model ${resolved.embedding.model}`
        : `Embedding 模型 ${resolved.embedding.model}`,
    availableModels.llmModels.includes(resolved.llm.model)
      ? null
      : language === 'en'
        ? `LLM model ${resolved.llm.model}`
        : `LLM 模型 ${resolved.llm.model}`,
  ].filter((item): item is string => Boolean(item))

  if (missingModels.length > 0) {
    return {
      ...result,
      error: language === 'en'
        ? `Model list check failed: Missing ${missingModels.join(', ')}.`
        : `模型列表检测失败：未找到 ${missingModels.join('，')}。`,
    }
  }

  result.modelsOk = true

  try {
    const vectors = await requestEmbeddings(resolved.embedding, ['ping'])
    result.embeddingOk = true
    result.embeddingDimension = vectors[0]?.length ?? null
  } catch (error) {
    return {
      ...result,
      error: formatLocalizedError(
        language === 'en' ? 'Embedding check failed' : 'Embedding 检测失败',
        error instanceof Error ? localizeProbeAiDetail(error.message, language) : null,
        language,
      ),
    }
  }

  try {
    const text = await completeText(
      resolved.llm,
      [
        {
          role: 'system',
          content: 'You are a connectivity probe. Reply with OK.',
        },
        {
          role: 'user',
          content: 'Reply with OK only.',
        },
      ],
      {
        temperature: 0,
        maxTokens: 16,
      },
    )

    result.llmOk = text.trim().length > 0
  } catch (error) {
    return {
      ...result,
      error: formatLocalizedError(
        language === 'en' ? 'LLM check failed' : 'LLM 检测失败',
        error instanceof Error ? localizeProbeAiDetail(error.message, language) : null,
        language,
      ),
    }
  }

  try {
    let receivedAnyChunk = false

    for await (const chunk of streamChatCompletion(
      resolved.llm,
      [
        {
          role: 'system',
          content: 'You are a connectivity probe. Reply with OK.',
        },
        {
          role: 'user',
          content: 'Reply with OK only.',
        },
      ],
      {
        temperature: 0,
        maxTokens: 16,
      },
    )) {
      if (chunk.trim()) {
        receivedAnyChunk = true
      }
    }

    result.llmStreamingOk = receivedAnyChunk || result.llmOk
  } catch (error) {
    return {
      ...result,
      error: formatLocalizedError(
        language === 'en' ? 'LLM streaming check failed' : 'LLM 流式检测失败',
        error instanceof Error ? localizeProbeAiDetail(error.message, language) : null,
        language,
      ),
    }
  }

  if (config.multimodalImageAnalysisEnabled) {
    try {
      const text = await completeText(
        resolved.llm,
        buildMultimodalProbeMessages(),
        {
          temperature: 0,
          maxTokens: 16,
        },
      )

      result.llmMultimodalOk = text.trim().length > 0
    } catch (error) {
      if (isMultimodalCapabilityError(error)) {
        result.llmMultimodalOk = false
      } else {
        return {
          ...result,
          error: formatLocalizedError(
            language === 'en' ? 'LLM multimodal check failed' : 'LLM 多模态检测失败',
            error instanceof Error ? localizeProbeAiDetail(error.message, language) : null,
            language,
          ),
        }
      }
    }
  }

  return {
    ...result,
    success: result.modelsOk
      && result.embeddingOk
      && result.llmOk
      && result.llmStreamingOk,
  }
}
