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

interface TagSuggestionResult {
  categories: string[]
  detailTags: string[]
  summary: string | null
}

export interface TagSuggestionBatchOptions {
  maxBatchBlocks?: number
  responseReserveTokens?: number
}

export interface CalendarSuggestionExtractionInput {
  content: string
  referenceDate: string
  timezone: string
  maxSuggestions?: number
}

export interface CalendarSuggestionExtractionResult {
  title: string
  notes: string | null
  date: string
  startTime: string | null
  allDay: boolean
  confidence: number
  evidenceText: string | null
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
  recordRequest(kind: 'llm' | 'embedding'): void
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
  streamDocument(
    topic: string,
    blocks: Block[],
    context?: { writingGuide?: string | null; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string>
  suggestTags(input: TagSuggestionInput): Promise<TagSuggestionResult>
  suggestTagsBatch(inputs: TagSuggestionInput[], options?: TagSuggestionBatchOptions): Promise<TagSuggestionResult[]>
  extractCalendarSuggestions(input: CalendarSuggestionExtractionInput): Promise<CalendarSuggestionExtractionResult[]>
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
): TagSuggestionResult {
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

function sanitizeStructuredTagBatch(
  payload: unknown,
  inputs: TagSuggestionInput[],
): TagSuggestionResult[] {
  const data = payload as { items?: unknown }
  const fallback: TagSuggestionResult[] = inputs.map(() => ({
    categories: [],
    detailTags: [],
    summary: null,
  }))

  if (!Array.isArray(data?.items)) {
    return fallback
  }

  for (const item of data.items) {
    const structuredItem = item as { index?: unknown }
    const rawIndex = structuredItem.index
    const index = typeof rawIndex === 'number' ? Math.trunc(rawIndex) : Number.NaN

    if (!Number.isInteger(index) || index < 0 || index >= inputs.length) {
      continue
    }

    const input = inputs[index]
    fallback[index] = sanitizeStructuredTags(item, input.categoryCandidates, input.detailCandidates, input.userTags)
  }

  return fallback
}

function buildTagSuggestionInstructions(formatDescription: string): string {
  return [
    '你是长布的标签分配助手。',
    formatDescription,
    '分类标签用于大类归档，数量 1 到 3 个。',
    '细标签用于体现块里具体在说什么，数量 1 到 5 个，必须具体，优先名词性内容标签。',
    'summary 是这个块的一句简短总结，用于连接图和块预览，尽量控制在 12 到 30 个汉字之间。',
    '细标签要尽量体现设备、产品、考试、方法、概念、项目对象、资料主题等具体内容。',
    '不要用空泛标签替代具体内容，例如不要只写“学习”“生活”“工具”来代替块里真正的对象。',
    '分类标签允许更概括，但细标签必须具体。',
    '优先复用给定的分类候选、细标签记忆和用户标签。',
    '不要把用户标签原样机械复制进输出，只有内容确实匹配时才复用。',
    '不要输出解释、不要输出 Markdown、不要输出额外字段。',
  ].join('\n')
}

function buildTagSuggestionMessages(input: TagSuggestionInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结"}。',
      ),
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

function buildBatchTagSuggestionMessages(inputs: TagSuggestionInput[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        '请基于用户输入内容输出严格 JSON，格式为 {"items":[{"index":0,"categories":["分类1"],"detail_tags":["细标签1"],"summary":"简短总结"}]}。',
      ),
    },
    {
      role: 'user',
      content: inputs.map((input, index) => [
        `块索引：${index}`,
        `分类候选：${input.categoryCandidates.join('、') || '无'}`,
        `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
        `用户标签记忆：${input.userTags.join('、') || '无'}`,
        '',
        '内容如下：',
        input.content,
      ].join('\n')).join('\n\n---\n\n'),
    },
  ]
}

function buildCalendarSuggestionMessages(input: CalendarSuggestionExtractionInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是长布的日历计划提取助手。',
        '你的任务是从用户笔记中提取明确的未来安排，只输出严格 JSON。',
        '输出格式必须为 {"items":[{"title":"安排标题","date":"YYYY-MM-DD","start_time":"HH:mm或null","all_day":true,"notes":"补充说明或null","confidence":0.9,"evidence_text":"原文证据"}]}。',
        '只提取明确面向未来、且日期可确定的安排。',
        '如果没有明确日期，不要输出任何条目。',
        '允许解析“今天/明天/后天/本周X/下周X/M月D日/YYYY-MM-DD”等相对或显式日期，但必须换算成 YYYY-MM-DD。',
        '如果原文没有明确时间，start_time 设为 null，all_day 设为 true。',
        '如果原文有明确时间，start_time 用 24 小时制 HH:mm，all_day 设为 false。',
        '不要猜测含糊意图；例如“改天”“之后”“有空再说”都不能提取。',
        'title 保持简洁明确，notes 用于补充上下文，evidence_text 引用原文中的关键信息片段。',
        '不要输出解释、不要输出 Markdown、不要输出 JSON 以外的内容。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `参考日期：${input.referenceDate}`,
        `时区：${input.timezone}`,
        `最多输出：${Math.max(0, Math.round(input.maxSuggestions ?? 3))} 条`,
        '',
        '内容如下：',
        input.content,
      ].join('\n'),
    },
  ]
}

function sanitizeCalendarSuggestionTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
}

function sanitizeCalendarSuggestionDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function sanitizeCalendarSuggestionTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null
}

function sanitizeStructuredCalendarSuggestions(
  payload: unknown,
  maxSuggestions: number,
): CalendarSuggestionExtractionResult[] {
  const data = payload as { items?: unknown }

  if (!Array.isArray(data?.items) || maxSuggestions <= 0) {
    return []
  }

  const results: CalendarSuggestionExtractionResult[] = []
  const seen = new Set<string>()

  for (const item of data.items) {
    const structuredItem = item as {
      title?: unknown
      notes?: unknown
      date?: unknown
      start_time?: unknown
      startTime?: unknown
      all_day?: unknown
      allDay?: unknown
      confidence?: unknown
      evidence_text?: unknown
      evidenceText?: unknown
    }
    const title = sanitizeCalendarSuggestionTitle(structuredItem.title)
    const date = sanitizeCalendarSuggestionDate(structuredItem.date)
    const startTime = sanitizeCalendarSuggestionTime(structuredItem.start_time ?? structuredItem.startTime)

    if (!title || !date) {
      continue
    }

    const key = `${date}::${startTime ?? ''}::${title.toLowerCase()}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    results.push({
      title,
      notes:
        typeof structuredItem.notes === 'string'
          ? structuredItem.notes.trim().replace(/\s+/g, ' ').slice(0, 160) || null
          : null,
      date,
      startTime,
      allDay: typeof (structuredItem.all_day ?? structuredItem.allDay) === 'boolean'
        ? Boolean(structuredItem.all_day ?? structuredItem.allDay)
        : startTime == null,
      confidence: typeof structuredItem.confidence === 'number'
        ? Math.max(0, Math.min(1, Number(structuredItem.confidence.toFixed(3))))
        : 0.5,
      evidenceText:
        typeof (structuredItem.evidence_text ?? structuredItem.evidenceText) === 'string'
          ? String(structuredItem.evidence_text ?? structuredItem.evidenceText).trim().replace(/\s+/g, ' ').slice(0, 160) || null
          : null,
    })

    if (results.length >= maxSuggestions) {
      break
    }
  }

  return results
}

function estimateTokenCount(text: string): number {
  if (!text.trim()) {
    return 0
  }

  const cjkChars = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length
  const latinWords = text.match(/[A-Za-z0-9_/-]+/g)?.length ?? 0
  const punctuationChars = text.match(/[^\sA-Za-z0-9\u3400-\u9FFF\uF900-\uFAFF]/g)?.length ?? 0
  const otherChars = Math.max(0, text.length - cjkChars - punctuationChars)

  return Math.max(
    1,
    Math.ceil(cjkChars * 1.1 + latinWords * 1.3 + punctuationChars * 0.4 + otherChars * 0.3),
  )
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokenCount(message.content) + 16, 0)
}

function resolveApproxContextWindow(model: string): number {
  const normalized = model.trim().toLowerCase()

  if (!normalized) {
    return 32_000
  }

  if (/gpt-3\.5|deepseek-chat/.test(normalized)) {
    return 16_000
  }

  if (/gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|o1|o3|claude|gemini|qwen|max|sonnet|haiku|deepseek/.test(normalized)) {
    return 128_000
  }

  return 32_000
}

function splitTagSuggestionInputsIntoBatches(
  inputs: TagSuggestionInput[],
  model: string,
  options: TagSuggestionBatchOptions = {},
): TagSuggestionInput[][] {
  const contextWindow = resolveApproxContextWindow(model)
  const responseReserveTokens = Math.max(256, Math.round(options.responseReserveTokens ?? 1_600))
  const maxBatchBlocks = Math.max(1, Math.round(options.maxBatchBlocks ?? 5))
  const maxPromptTokens = Math.max(2_000, contextWindow - responseReserveTokens)
  const batches: TagSuggestionInput[][] = []
  let currentBatch: TagSuggestionInput[] = []

  for (const input of inputs) {
    const candidateBatch = [...currentBatch, input]
    const candidateMessages = buildBatchTagSuggestionMessages(candidateBatch)
    const candidatePromptTokens = estimateMessageTokens(candidateMessages)

    if (currentBatch.length > 0 && (candidateBatch.length > maxBatchBlocks || candidatePromptTokens > maxPromptTokens)) {
      batches.push(currentBatch)
      currentBatch = [input]
      continue
    }

    currentBatch = candidateBatch
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
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

    async suggestTagsBatch(inputs) {
      return inputs.map((input) => ({
        categories: [],
        detailTags: input.detailCandidates.slice(0, 3),
        summary: input.content.replace(/\s+/g, ' ').trim().slice(0, 32) || null,
      }))
    },

    async extractCalendarSuggestions() {
      return []
    },
  }
}

export function createLiveLLMProvider(config: AIConfig, sink?: TokenUsageSink): LLMProvider {
  const resolved = buildResolvedConfig(config)
  const suggestSingleTags = async (input: TagSuggestionInput): Promise<TagSuggestionResult> => {
    const messages = buildTagSuggestionMessages(input)
    const text = await completeText(resolved.llm, messages, {
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
  }
}

export async function probeAiConfig(config: AIConfig): Promise<ApiTestResult> {
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

  let availableModels: { llmModels: string[]; embeddingModels: string[] }

  try {
    availableModels = await requestProbeModelLists(resolved)
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? `模型列表检测失败：${error.message}` : '模型列表检测失败。',
    }
  }

  const missingModels = [
    availableModels.embeddingModels.includes(resolved.embedding.model) ? null : `Embedding 模型 ${resolved.embedding.model}`,
    availableModels.llmModels.includes(resolved.llm.model) ? null : `LLM 模型 ${resolved.llm.model}`,
  ].filter((item): item is string => Boolean(item))

  if (missingModels.length > 0) {
    return {
      ...result,
      error: `模型列表检测失败：未找到 ${missingModels.join('，')}。`,
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
