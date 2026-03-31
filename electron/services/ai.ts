import { createHash } from 'node:crypto'

import type { AIConfig, AIEndpointConfig, AIExecutionMode, ApiTestResult, Block } from '../../shared/types'

const EMBEDDING_TIMEOUT_MS = 30_000
const CHAT_TIMEOUT_MS = 90_000
export const DEFAULT_MOCK_EMBEDDING_DIMENSION = 1536

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

interface TagSuggestionInput {
  content: string
  categoryCandidates: string[]
  detailCandidates: string[]
  userTags: string[]
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMCompletionOptions {
  stream?: boolean
  temperature?: number
  maxTokens?: number
}

export interface TokenUsageSink {
  add(promptTokens: number, completionTokens: number): void
}

interface ResolvedAIConfig {
  llm: AIEndpointConfig & { resolvedBaseUrl: string }
  embedding: AIEndpointConfig & { resolvedBaseUrl: string }
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>
}

export interface LLMProvider {
  streamDocument(topic: string, blocks: Block[], context?: { writingGuide?: string | null }): AsyncGenerator<string>
  suggestTags(input: TagSuggestionInput): Promise<{ categories: string[]; detailTags: string[]; summary: string | null }>
}

function textToVector(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0)

  for (let index = 0; index < text.length; index += 1) {
    const position = index % vector.length
    vector[position] = Number(((vector[position] + text.charCodeAt(index)) / 255).toFixed(6))
  }

  return vector
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = []

  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }

  return chunks
}

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
    })
  } catch {
    payload = JSON.stringify({
      llm: config.llm,
      embedding: config.embedding,
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

async function requestEmbeddings(config: AIEndpointConfig & { resolvedBaseUrl: string }, texts: string[], sink?: TokenUsageSink): Promise<number[][]> {
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
): Promise<Response> {
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
  })

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
  })

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

function buildMockDocument(topic: string, blocks: Block[], writingGuide?: string | null): string {
  if (blocks.length === 0) {
    return [
      `# 关于「${topic}」的整理`,
      '',
      '## 当前状态',
      '还没有找到可用的记录片段，所以这是一份空白骨架。',
      ...(writingGuide
        ? [
            '',
            '## 编排提示',
            writingGuide,
          ]
        : []),
      '',
      '## 下一步建议',
      '- 先在时间轴里录入几条与主题相关的块。',
      '- 再次点击“生成文档”，验证检索与编排链路。',
    ].join('\n')
  }

  const grouped = new Map<string, Block[]>()

  for (const block of blocks) {
    const groupName = block.tags[0]?.name ?? '未分类'
    const current = grouped.get(groupName) ?? []
    current.push(block)
    grouped.set(groupName, current)
  }

  const sections = Array.from(grouped.entries()).map(([tag, items]) => {
    const bulletList = items
      .slice(0, 4)
      .map((item) => `- ${item.content.trim().replace(/\n+/g, ' ')}`)
      .join('\n')

    return [`## 主题线索：${tag}`, bulletList].join('\n')
  })

  return [
    `# 关于「${topic}」的整理`,
    '',
    '## 摘要',
    `这是一份由长布骨架版生成的模拟文档，共整理 ${blocks.length} 条相关记录。当前输出用于验证检索、聚合和流式展示链路。`,
    ...(writingGuide
      ? [
          '',
          '## 编排提示',
          writingGuide,
        ]
      : []),
    '',
    ...sections,
    '',
    '## 下一步',
    '- 根据这些块继续补充事实和例子。',
    '- 等真实 LLM 接入后，用同一接口替换当前 mock 输出。',
  ].join('\n')
}

function buildDocumentMessages(topic: string, blocks: Block[], writingGuide?: string | null): ChatMessage[] {
  const grouped = new Map<string, string[]>()

  for (const block of blocks) {
    const key = block.tags[0]?.name ?? '未分类'
    const current = grouped.get(key) ?? []
    current.push(block.content.trim())
    grouped.set(key, current)
  }

  const sections = Array.from(grouped.entries())
    .map(([tag, entries], index) => {
      const lines = entries.map((entry, entryIndex) => `${entryIndex + 1}. ${entry}`).join('\n')
      return `分组 ${index + 1}｜${tag}\n${lines}`
    })
    .join('\n\n')

  return [
    {
      role: 'system',
      content: [
        '你是长布的笔记整理助手。',
        '你的任务是严格基于用户提供的原始块内容，整理成结构化 Markdown 文档。',
        '只能做整理、归纳、排序、补过渡，不允许补充原始块中不存在的事实。',
        '不要臆测用户动机、平台目标或测试结论；如果原文没写，就不要补。',
        '保持原始术语、模型名、产品名和技术名，不要替换或泛化。',
        '不要把 “live” 自动解释成“生产环境”；如果需要提到它，直接写 “live” 或 “live 模式”。',
        '不要补充测试时间、测试范围、环境级别、性能结论等原文没有提供的信息。',
        '如果信息不足，请明确写“信息不足”，不要猜测。',
        '当原始块较少时，输出保持简洁，不要为了完整而扩写成长篇背景介绍。',
        '输出必须是 Markdown，至少包含：标题、摘要、按主题分节的正文、待确认项或下一步。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `主题：${topic}`,
        '',
        ...(writingGuide
          ? [
              '以下是当前笔记本整理出的写作指令与编排提示。它们用于约束结构和表达，不属于事实引用，请先遵守这些提示：',
              writingGuide,
              '',
            ]
          : []),
        '以下是已召回并按标签聚类后的原始块，请基于它们整理文档。请优先复述和组织块中的事实，不要自己补背景：',
        sections || '没有召回到块，请输出一份说明信息不足的短文档。',
      ].join('\n'),
    },
  ]
}

function extractJsonObject(text: string): unknown {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() ?? text.trim()
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw formatProviderError('标签 JSON 解析失败')
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
}

function normalizeSuggestedTag(tag: unknown): string {
  return typeof tag === 'string' ? tag.trim().replace(/\s+/g, ' ') : ''
}

function sanitizeStructuredTags(
  payload: unknown,
  categoryCandidates: string[],
  detailCandidates: string[],
  userTags: string[],
): { categories: string[]; detailTags: string[]; summary: string | null } {
  const data = payload as { categories?: unknown; detail_tags?: unknown; detailTags?: unknown; summary?: unknown }
  const categorySet = new Set(categoryCandidates.map((tag) => tag.toLowerCase()))
  const detailMemorySet = new Set([...detailCandidates, ...userTags].map((tag) => tag.toLowerCase()))

  const categories = Array.isArray(data?.categories)
    ? Array.from(
        new Set(
          data.categories
            .map(normalizeSuggestedTag)
            .filter(Boolean)
            .map((tag) => {
              const matchingCategory = categoryCandidates.find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
              return matchingCategory ?? tag
            }),
        ),
      ).slice(0, 3)
    : []

  const rawDetailTags = Array.isArray(data?.detail_tags) ? data.detail_tags : Array.isArray(data?.detailTags) ? data.detailTags : []

  const detailTags = Array.from(
    new Set(
      rawDetailTags
        .map(normalizeSuggestedTag)
        .filter(Boolean)
        .map((tag) => {
          const exactMemory = [...detailCandidates, ...userTags].find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
          return exactMemory ?? tag
        }),
    ),
  )
    .filter((tag) => !categorySet.has(tag.toLowerCase()))
    .slice(0, 5)

  return {
    categories,
    detailTags: detailTags.map((tag) => {
      const memory = [...detailCandidates, ...userTags].find((candidate) => candidate.toLowerCase() === tag.toLowerCase())
      return memory ?? (detailMemorySet.has(tag.toLowerCase()) ? tag : tag)
    }),
    summary:
      typeof data?.summary === 'string'
        ? data.summary.trim().replace(/\s+/g, ' ').slice(0, 80) || null
        : null,
  }
}

function buildTagSuggestionMessages(input: TagSuggestionInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是长布的标签分配助手。',
        '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结"}。',
        '分类标签用于大类归档，数量 1 到 3 个。',
        '细标签用于体现块里具体在说什么，数量 1 到 5 个，必须具体，优先名词性内容标签。',
        'summary 是这个块的一句简短总结，用于连接图和块预览，尽量控制在 12 到 30 个汉字之间。',
        '细标签要尽量体现设备、产品、考试、方法、概念、项目对象、资料主题等具体内容。',
        '不要用空泛标签替代具体内容，例如不要只写“学习”“生活”“工具”来代替块里真正的对象。',
        '分类标签允许更概括，但细标签必须具体。',
        '优先复用给定的分类候选、细标签记忆和用户标签。',
        '不要把用户标签原样机械复制进输出，只有内容确实匹配时才复用。',
        '不要输出解释、不要输出 Markdown、不要输出额外字段。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `分类候选：${input.categoryCandidates.join('、') || '无'}`,
        `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
        `用户标签记忆：${input.userTags.join('、') || '无'}`,
        '',
        '内容如下：',
        input.content,
      ].join('\n'),
    },
  ]
}

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

    async suggestTags(input) {
      return {
        categories: [],
        detailTags: input.detailCandidates.slice(0, 3),
        summary: input.content.replace(/\s+/g, ' ').trim().slice(0, 32) || null,
      }
    },
  }
}

export function createLiveLLMProvider(config: AIConfig, sink?: TokenUsageSink): LLMProvider {
  const resolved = buildResolvedConfig(config)

  return {
    async *streamDocument(topic, blocks, context) {
      const messages = buildDocumentMessages(topic, blocks, context?.writingGuide)

      for await (const chunk of streamChatCompletion(resolved.llm, messages, {
        temperature: 0.1,
        maxTokens: 1_200,
      }, sink)) {
        yield chunk
      }
    },

    async suggestTags(input) {
      const messages = buildTagSuggestionMessages(input)
      const text = await completeText(resolved.llm, messages, {
        temperature: 0,
        maxTokens: 260,
      }, sink)
      const parsed = extractJsonObject(text)
      return sanitizeStructuredTags(parsed, input.categoryCandidates, input.detailCandidates, input.userTags)
    },
  }
}

export async function probeAiConfig(config: AIConfig): Promise<ApiTestResult> {
  const checkedAt = new Date().toISOString()
  const configFingerprint = createConfigFingerprint(config)
  let resolved: ResolvedAIConfig
  let resolvedBaseUrl = ''

  try {
    resolved = buildResolvedConfig(config)
    resolvedBaseUrl = resolved.embedding.resolvedBaseUrl === resolved.llm.resolvedBaseUrl ? resolved.llm.resolvedBaseUrl : resolved.llm.resolvedBaseUrl
  } catch (error) {
    return {
      success: false,
      modelsOk: false,
      embeddingOk: false,
      llmOk: false,
      llmStreamingOk: false,
      resolvedBaseUrl: config.llm.endpoint.trim() || config.embedding.endpoint.trim(),
      embeddingModel: config.embedding.model.trim(),
      embeddingDimension: null,
      chatModel: config.llm.model.trim(),
      checkedAt,
      configFingerprint,
      error: error instanceof Error ? `地址解析失败：${error.message}` : '地址解析失败。',
    }
  }

  const result: ApiTestResult = {
    success: false,
    modelsOk: false,
    embeddingOk: false,
    llmOk: false,
    llmStreamingOk: false,
    resolvedBaseUrl,
    embeddingModel: resolved.embedding.model,
    embeddingDimension: null,
    chatModel: resolved.llm.model,
    checkedAt,
    configFingerprint,
  }

  let availableModels: string[]

  try {
    availableModels = await requestModels(resolved.llm)
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? `模型列表检测失败：${error.message}` : '模型列表检测失败。',
    }
  }

  if (!availableModels.includes(resolved.embedding.model) || !availableModels.includes(resolved.llm.model)) {
    return {
      ...result,
      error: `模型列表检测失败：未找到 ${resolved.embedding.model} 或 ${resolved.llm.model}。`,
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
      error: error instanceof Error ? `Embedding 检测失败：${error.message}` : 'Embedding 检测失败。',
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
      error: error instanceof Error ? `LLM 检测失败：${error.message}` : 'LLM 检测失败。',
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
      error: error instanceof Error ? `LLM 流式检测失败：${error.message}` : 'LLM 流式检测失败。',
    }
  }

  return {
    ...result,
    success: result.modelsOk && result.embeddingOk && result.llmOk && result.llmStreamingOk,
  }
}
