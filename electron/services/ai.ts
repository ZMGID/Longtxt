import { createHash } from 'node:crypto'

import { getAiInsightMethodDefinition } from '../../shared/aiInsights'
import type {
  AIConfig,
  AIEndpointConfig,
  AIExecutionMode,
  AiInsightMethodId,
  ApiTestResult,
  AppLanguage,
  Block,
  BlockImageAnnotation,
  CalendarEntryStatus,
} from '../../shared/types'

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
  images?: TagSuggestionImageInput[]
  skippedImages?: number
}

interface TagSuggestionResult {
  categories: string[]
  detailTags: string[]
  summary: string | null
  imageAnnotations: BlockImageAnnotation[]
}

export interface TagSuggestionImageInput {
  index: number
  altText: string | null
  url: string
  mimeType: string | null
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

export interface DailyReviewGenerationInput {
  language: AppLanguage
  date: string
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  blocks: Array<{
    id: string
    createdAt: string
    preview: string
    content: string
    summary?: string | null
    tags: string[]
  }>
  entries: Array<{
    id: string
    title: string
    notes: string | null
    startTime: string | null
    allDay: boolean
    status: CalendarEntryStatus
  }>
}

export interface AiInsightGenerationInput {
  language: AppLanguage
  methodId: AiInsightMethodId
  methodLabel: string
  promptPreset: string
  anchorDate: string
  rangeStart: string
  rangeEnd: string
  blockCount: number
  plannedEntryCount: number
  doneEntryCount: number
  canceledEntryCount: number
  topTags: string[]
  dayDigests: Array<{
    date: string
    blockCount: number
    topTags: string[]
    previews: string[]
    plannedEntryCount: number
    doneEntryCount: number
    canceledEntryCount: number
  }>
  blocks: Array<{
    id: string
    date: string
    createdAt: string
    preview: string
    content: string
    summary?: string | null
    tags: string[]
  }>
  entries: Array<{
    id: string
    date: string
    title: string
    notes: string | null
    startTime: string | null
    allDay: boolean
    status: CalendarEntryStatus
  }>
}

interface ChatTextPart {
  type: 'text'
  text: string
}

interface ChatImagePart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

type ChatContentPart = ChatTextPart | ChatImagePart

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
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
  streamDailyReview(input: DailyReviewGenerationInput): AsyncGenerator<string>
  streamAiInsight(input: AiInsightGenerationInput): AsyncGenerator<string>
  suggestTags(input: TagSuggestionInput): Promise<TagSuggestionResult>
  suggestTagsBatch(inputs: TagSuggestionInput[], options?: TagSuggestionBatchOptions): Promise<TagSuggestionResult[]>
  extractCalendarSuggestions(input: CalendarSuggestionExtractionInput): Promise<CalendarSuggestionExtractionResult[]>
  generateDailyReview(input: DailyReviewGenerationInput): Promise<string>
  generateAiInsight(input: AiInsightGenerationInput): Promise<string>
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

const PROBE_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII='

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

function buildTagSuggestionOutputFormat(multimodal: boolean): string {
  return multimodal
    ? '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结","image_annotations":[{"index":0,"annotation":"图片内容批注"}]}。'
    : '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结"}。'
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

function formatEntryTimeLabel(
  entry: DailyReviewGenerationInput['entries'][number],
  language: AppLanguage,
): string {
  if (entry.allDay || !entry.startTime) {
    return language === 'en' ? 'all day' : '全天'
  }

  return entry.startTime
}

function buildMockDailyReview(input: DailyReviewGenerationInput): string {
  if (input.language === 'en') {
    const tagText = input.topTags.length > 0 ? input.topTags.map((tag) => `#${tag}`).join(', ') : 'no stable themes yet'
    const firstParagraph = [
      `On ${input.date}, there were ${input.blockCount} notes recorded.`,
      input.entries.length > 0
        ? ` Calendar had ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, and ${input.canceledEntryCount} canceled items.`
        : ' There were no extra calendar events, so the rhythm mainly came from notes.',
      ` Main themes were around ${tagText}.`,
    ].join('')

    const entryParagraph = input.entries.length > 0
      ? `Calendar split the day into a few clear checkpoints: ${input.entries
        .slice(0, 5)
        .map((entry) => `${formatEntryTimeLabel(entry, input.language)} "${entry.title}" ${entry.status === 'done' ? 'was completed' : entry.status === 'canceled' ? 'was later canceled' : 'remained an important task'}`)
        .join(', ')}.`
      : 'Without fixed schedule entries, the day looked more like continuous progress: capture thoughts, write notes, then gradually merge loose threads.'

    const blockParagraphs = input.blocks.slice(0, 4).map((block, index) => {
      const tagLabel = block.tags.length > 0 ? ` and it connected with ${block.tags.slice(0, 3).join(', ')}` : ''
      return `${index === 0 ? 'Most visible first was' : 'Then came'} "${block.preview}"${tagLabel}. It preserved a concrete focus segment from today and made the day more than a timeline of events.`
    })

    const closingParagraph = input.blockCount > 0
      ? 'Taken together, this day was not defined by one single event. It was a day of parallel threads, some already landed and some still in draft form, but now clearly visible as a whole.'
      : 'There are still no concrete note blocks today, so this remains a placeholder page waiting for real records.'

    return [
      firstParagraph,
      entryParagraph,
      ...blockParagraphs,
      closingParagraph,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  const tagText = input.topTags.length > 0 ? input.topTags.map((tag) => `#${tag}`).join('、') : '暂时还没有形成特别稳定的主题'
  const firstParagraph = [
    `${input.date} 这一天一共留下了 ${input.blockCount} 条记录，`,
    input.entries.length > 0
      ? `同时还有 ${input.plannedEntryCount} 项待办、${input.doneEntryCount} 项完成、${input.canceledEntryCount} 项取消的安排。`
      : '这一天没有额外的日历安排，节奏主要体现在笔记本身。',
    `从内容上看，今天更靠近 ${tagText} 这些线索。`,
  ].join('')

  const entryParagraph = input.entries.length > 0
    ? `日历上的安排把这一天切成了几个清晰的节点：${input.entries
      .slice(0, 5)
      .map((entry) => `${formatEntryTimeLabel(entry, input.language)}的「${entry.title}」${entry.status === 'done' ? '已经完成' : entry.status === 'canceled' ? '后来取消了' : '仍然是今天的重要安排'}`)
      .join('，')}。`
    : '因为没有排定的日历事项，这一天更像是一种连续推进：想到什么、记下什么，再慢慢把零散的线头拢到一起。'

  const blockParagraphs = input.blocks.slice(0, 4).map((block, index) => {
    const tagLabel = block.tags.length > 0 ? `，也能看出它和 ${block.tags.slice(0, 3).join('、')} 这些主题相关` : ''
    return `${index === 0 ? '回看内容，最先浮出来的是' : '接着是'}“${block.preview}”${tagLabel}。这条记录把今天的一段具体注意力留了下来，也让整天的脉络不只是安排表上的几个时间点。`
  })

  const closingParagraph = input.blockCount > 0
    ? `把这些块串起来看，今天并不是被单一事件定义的一天，而是几条线索并行推进的一天。它们有的已经落地，有的还停在草稿和提醒的阶段，但合在一起，已经能看出这一天真正被什么占据。`
    : '今天还没有留下具体块内容，所以现在更像是一个空白的页脚：结构已经在，真正的叙述还要等你把这一天写下来。'

  return [
    firstParagraph,
    entryParagraph,
    ...blockParagraphs,
    closingParagraph,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function sanitizeLongformMarkdownResponse(text: string): string {
  const withoutFence = text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const lines = withoutFence.split('\n')

  if (lines[0]?.trim().match(/^#\s+/)) {
    return lines.slice(1).join('\n').trim()
  }

  return withoutFence
}

export function sanitizeDailyReviewResponse(text: string): string {
  return sanitizeLongformMarkdownResponse(text)
}

function buildAiInsightLead(input: AiInsightGenerationInput): {
  methodLabel: string
  tagsLabel: string
  busiestDayLabel: string
  newestPreview: string
  entryLabel: string
  reviewSpanLabel: string
} {
  const method = getAiInsightMethodDefinition(input.methodId, input.language)
  const isEnglish = input.language === 'en'
  const tagsLabel = input.topTags.length > 0
    ? input.topTags.map((tag) => `#${tag}`).join(isEnglish ? ', ' : '、')
    : isEnglish ? 'no stable themes yet' : '还没有稳定成型的主题'
  const busiestDay = [...input.dayDigests].sort((left, right) => right.blockCount - left.blockCount || right.date.localeCompare(left.date))[0]
  const newestPreview = input.blocks[0]?.preview ?? (isEnglish ? 'no clearly highlighted note thread in this period yet' : '这段时间还没有留下明显的块线索')
  const entryLabel = input.entries.length > 0
    ? isEnglish
      ? `${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`
      : `安排 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`
    : isEnglish ? 'no extra calendar schedule in this period' : '这段时间没有额外的日历安排'

  return {
    methodLabel: method?.label ?? input.methodLabel,
    tagsLabel,
    busiestDayLabel: busiestDay
      ? isEnglish
        ? `${busiestDay.date} (${busiestDay.blockCount} blocks)`
        : `${busiestDay.date}（${busiestDay.blockCount} 条块）`
      : isEnglish ? 'no obvious peak day' : '暂无明显高峰日',
    newestPreview,
    entryLabel,
    reviewSpanLabel: isEnglish ? `${input.rangeStart} to ${input.rangeEnd}` : `${input.rangeStart} 至 ${input.rangeEnd}`,
  }
}

function buildMockAiInsight(input: AiInsightGenerationInput): string {
  const lead = buildAiInsightLead(input)
  const previewList = input.blocks.slice(0, 3).map((block) => `- ${block.date} · ${block.preview}`).join('\n') || (input.language === 'en' ? '- No highlighted blocks yet' : '- 暂无重点块')

  if (input.language === 'en') {
    return [
      `## Core signal under "${lead.methodLabel}"`,
      `Across ${lead.reviewSpanLabel}, recurring attention still clusters around ${lead.tagsLabel}. The highest-density day was ${lead.busiestDayLabel}.`,
      '',
      '## What this likely means now',
      `Calendar rhythm (${lead.entryLabel}) shaped timing, but note content still explains where sustained cognitive load went.`,
      '',
      '## Most actionable thread',
      `If only one thread should be pushed next, start from the one that appears repeatedly and is already concrete enough to execute. Current representative sample: "${lead.newestPreview}".`,
      '',
      '## Evidence from recent samples',
      previewList,
    ].join('\n')
  }

  switch (input.methodId) {
    case 'values-clarification':
      return [
        '## 反复投入说明了什么',
        `在「${lead.methodLabel}」视角下看，${lead.reviewSpanLabel} 这段时间里，注意力最稳定地落在 ${lead.tagsLabel} 这些主题上。比起一次性的突发任务，更值得注意的是你愿意持续回到这些线索上，说明它们更接近“真正重要”的事项，而不只是顺手处理。`,
        '',
        '## 哪些事情更像被动消耗',
        `从节奏上看，最容易把注意力拖散的不是单个任务，而是来回切换带来的残留负担。${lead.entryLabel} 让时间被切成几个节点，但真正占住脑力的往往还是块里反复出现的主题。当前最醒目的例子是「${lead.newestPreview}」。`,
        '',
        '## 现在更值得保护的投入',
        '如果接下来只能保住少数几条线索，优先级应该给那些既反复出现、又已经形成具体记录的方向，而不是临时冒出来却没有延续的事项。可以把它们理解为：你已经用时间投票过的主题。',
        '',
        '## 这两周的样本依据',
        previewList,
      ].join('\n')
    case 'reverse-thinking':
      return [
        '## 如果要让接下来更糟',
        `最直接的办法就是继续让 ${lead.tagsLabel} 这些线索处在“想到了就记一笔，但不做收束”的状态。这样短期看似没有停下，长期却会让每条线都停在半完成。`,
        '',
        '## 风险其实已经露头',
        `从最近样本看，最典型的风险不是完全没做，而是做了很多局部推进，却没有及时把高频主题并轨。高峰日出现在 ${lead.busiestDayLabel}，说明注意力并不缺，缺的是把推进结果压缩成下一步动作的动作。`,
        '',
        '## 反过来最有效的做法',
        '与其追求再多加几条新线，不如每次只选一条已经反复出现的主题，把它推进到“可交付、可回顾、可继续”的状态。逆向来看，能避免变糟的关键不是更努力，而是减少并行扩张。',
        '',
        '## 当前最值得先收束的线索',
        previewList,
      ].join('\n')
    case 'second-order-thinking':
      return [
        '## 短期上看起来有效的动作',
        `最近两周里，你已经把不少时间投入到 ${lead.tagsLabel} 上，短期收益是推进感更强、上下文更完整，尤其是像「${lead.newestPreview}」这样的记录，会立刻带来清晰感。`,
        '',
        '## 二阶影响更值得看',
        `但二阶后果不只取决于有没有推进，还取决于推进方式。如果这些事项总在高峰日集中爆发、平时缺少收束，它们后面会持续制造切换成本。${lead.entryLabel} 本身不是问题，真正的问题是它们是否把后续行动组织出来。`,
        '',
        '## 哪些动作正在积累复利',
        '凡是同时满足“反复出现”“有明确块记录”“能接到下一步”的动作，都在积累复利。它们会让未来的检索、回顾和安排越来越省力；相反，只留下碎片而没有承接的动作，会把成本推迟到以后。',
        '',
        '## 接下来值得提前布置的后手',
        previewList,
      ].join('\n')
    case 'cbt-patterns':
      return [
        '## 这批记录里常见的触发点',
        `仅从最近两周样本看，触发写作和安排的核心还是 ${lead.tagsLabel} 这些主题。它们不像偶发情绪，更像稳定存在的任务压力或关注对象。`,
        '',
        '## 可能反复出现的自动化解释',
        '当同一类事情反复出现、却又没有及时收束时，人很容易产生“我一直在推进，但好像总差一点”的自动化判断。这个判断未必准确，却会让注意力继续被未完成感牵着走。',
        '',
        '## 更稳的替代动作',
        '比起继续扩大输入，更有效的做法可能是给每条高频线索补一个“现在算推进到哪里”的明确句子。这样能把模糊压力转换成可操作的下一步，也更能中断那种一直悬着的感觉。',
        '',
        '## 当前样本里的依据',
        previewList,
      ].join('\n')
    case 'mbti-analysis':
      return [
        '## 这批样本显出的工作偏好',
        '以下只是根据最近两周文字样本做的偏好观察，不是人格定论。整体看，你更像是通过持续记录来维持思路清晰的人：先把线索捕捉下来，再慢慢压缩成更稳定的结构。',
        '',
        '## 什么环境会更顺手',
        `当主题相对集中、上下文能被连续保留时，你的推进质量会更高。${lead.entryLabel} 说明外部节奏是存在的，但真正决定产出的，仍然是有没有足够连续的整理空间。`,
        '',
        '## 需要搭配的补位方式',
        '如果说这类偏好最大的风险，就是容易把很多线索都先收进来，再慢慢处理。补位方式不是压掉记录欲，而是更早做取舍：哪些线索要继续喂养，哪些只需要留档就好。',
        '',
        '## 最近最能代表偏好的记录',
        previewList,
      ].join('\n')
    case 'default-insight':
    default:
      return [
        '## 这两周主要被什么占据',
        `从整体样本看，最近两周最稳定的主线仍然是 ${lead.tagsLabel}。这些主题不是偶尔出现，而是在不同日期里持续回流，说明它们已经构成了当前阶段真正的注意力骨架。`,
        '',
        '## 节奏在哪些地方被推快或拖慢',
        `高峰日出现在 ${lead.busiestDayLabel}，说明推进并不缺爆发力。真正影响节奏的，更像是是否有足够时间把爆发后的内容收束成下一步。${lead.entryLabel} 为这段时间提供了节拍，但块里的内容才决定了节拍是否变成结果。`,
        '',
        '## 现在最值得继续追的线索',
        `如果只看一个最应该继续追的方向，那会是已经多次出现、又开始形成具体表述的线索。像「${lead.newestPreview}」这样的内容，已经不只是灵感，而是接近可以继续深化的工作单元。`,
        '',
        '## 当前样本里的重点依据',
        previewList,
      ].join('\n')
  }
}

export function sanitizeAiInsightResponse(text: string): string {
  return sanitizeLongformMarkdownResponse(text)
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

function buildDailyReviewMessages(input: DailyReviewGenerationInput): ChatMessage[] {
  if (input.language === 'en') {
    const blockSection = input.blocks.length > 0
      ? input.blocks.map((block, index) => [
        `Block ${index + 1}`,
        `Time: ${block.createdAt}`,
        `Tags: ${block.tags.join(', ') || 'none'}`,
        `Summary: ${block.summary?.trim() || 'none'}`,
        `Preview: ${block.preview}`,
        'Content:',
        block.content,
      ].join('\n')).join('\n\n---\n\n')
      : 'No note blocks for today.'

    const entrySection = input.entries.length > 0
      ? input.entries.map((entry, index) => [
        `Entry ${index + 1}`,
        `Title: ${entry.title}`,
        `Time: ${entry.allDay ? 'all day' : entry.startTime ?? 'time not set'}`,
        `Status: ${entry.status}`,
        `Notes: ${entry.notes ?? 'none'}`,
      ].join('\n')).join('\n\n')
      : 'No calendar entries for today.'

    return [
      {
        role: 'system',
        content: [
          'You are Changbu\'s daily review assistant.',
          'Write a Markdown daily review strictly based on today\'s note blocks and calendar entries.',
          'Keep the tone natural and grounded. Do not fabricate events, conclusions, feelings, motives, or outcomes.',
          'If context is insufficient, explicitly say so.',
          'Do not output code fences or JSON.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Date: ${input.date}`,
          `Blocks: ${input.blockCount}`,
          `Calendar: ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`,
          `Top tags: ${input.topTags.join(', ') || 'none'}`,
          '',
          'Calendar entries:',
          entrySection,
          '',
          'Note blocks:',
          blockSection,
        ].join('\n'),
      },
    ]
  }

  const blockSection = input.blocks.length > 0
    ? input.blocks.map((block, index) => [
      `块 ${index + 1}`,
      `时间：${block.createdAt}`,
      `标签：${block.tags.join('、') || '无'}`,
      `摘要：${block.summary?.trim() || '无'}`,
      `预览：${block.preview}`,
      '正文：',
      block.content,
    ].join('\n')).join('\n\n---\n\n')
    : '今天没有块内容。'

  const entrySection = input.entries.length > 0
    ? input.entries.map((entry, index) => [
      `安排 ${index + 1}`,
      `标题：${entry.title}`,
      `时间：${entry.allDay ? '全天' : entry.startTime ?? '未写时间'}`,
      `状态：${entry.status}`,
      `备注：${entry.notes ?? '无'}`,
    ].join('\n')).join('\n\n')
    : '今天没有日历安排。'

  return [
    {
      role: 'system',
      content: [
        '你是长布的每日回顾助手。',
        '你的任务是严格根据当天块内容和当天日历安排，写一篇中文 Markdown 每日回顾正文。',
        '风格应自然、克制、像一篇可阅读的长文日记，不要写成汇报模板、问卷、清单或空洞鸡汤。',
        '只能整理、串联、概括用户已经写下来的事实与安排，不允许补充原始内容中不存在的事件、结论、心情、动机或结果。',
        '如果信息不足，就明确写出信息不足，不要编造细节。',
        '允许使用少量二级或三级标题，但不要套模板，不要把标签列表原样照抄成正文。',
        '不要输出代码块围栏，不要输出 JSON，不要写“以下是每日回顾”之类说明语。',
        '正文需要兼顾两部分：一是这一天实际记下了什么，二是日历安排如何影响这一天的节奏。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `日期：${input.date}`,
        `当天块数：${input.blockCount}`,
        `日历安排：计划 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`,
        `当天主题：${input.topTags.join('、') || '暂无明显主题'}`,
        '',
        '以下是当天日历：',
        entrySection,
        '',
        '以下是当天块内容：',
        blockSection,
      ].join('\n'),
    },
  ]
}


function buildAiInsightMessages(input: AiInsightGenerationInput): ChatMessage[] {
  if (input.language === 'en') {
    const daySection = input.dayDigests.length > 0
      ? input.dayDigests.map((day, index) => [
        `Day ${index + 1}`,
        `Date: ${day.date}`,
        `Blocks: ${day.blockCount}`,
        `Themes: ${day.topTags.join(', ') || 'none'}`,
        `Previews: ${day.previews.join('; ') || 'none'}`,
        `Calendar: ${day.plannedEntryCount} planned, ${day.doneEntryCount} done, ${day.canceledEntryCount} canceled`,
      ].join('\n')).join('\n\n')
      : 'No day-level records in this period.'

    const blockSection = input.blocks.length > 0
      ? input.blocks.map((block, index) => [
        `Reference block ${index + 1}`,
        `Date: ${block.date}`,
        `Time: ${block.createdAt}`,
        `Tags: ${block.tags.join(', ') || 'none'}`,
        `Summary: ${block.summary?.trim() || 'none'}`,
        `Preview: ${block.preview}`,
        'Content:',
        block.content,
      ].join('\n')).join('\n\n---\n\n')
      : 'No reference blocks in this period.'

    const entrySection = input.entries.length > 0
      ? input.entries.map((entry, index) => [
        `Entry ${index + 1}`,
        `Date: ${entry.date}`,
        `Title: ${entry.title}`,
        `Time: ${entry.allDay ? 'all day' : entry.startTime ?? 'time not set'}`,
        `Status: ${entry.status}`,
        `Notes: ${entry.notes ?? 'none'}`,
      ].join('\n')).join('\n\n')
      : 'No calendar entries in this period.'

    return [
      {
        role: 'system',
        content: [
          'You are Changbu\'s AI insight assistant.',
          'Write a Markdown insight strictly from note blocks and calendar entries in the last two weeks.',
          'Do not fabricate facts. Any interpretation must remain probabilistic.',
          'If using CBT/MBTI language, keep it observational and non-diagnostic.',
          'Do not output code fences or JSON.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Method: ${input.methodLabel}`,
          `Method requirement: ${input.promptPreset}`,
          `Anchor date: ${input.anchorDate}`,
          `Range: ${input.rangeStart} to ${input.rangeEnd}`,
          `Blocks in range: ${input.blockCount}`,
          `Calendar in range: ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`,
          `Top tags: ${input.topTags.join(', ') || 'none'}`,
          '',
          '14-day day-level summary:',
          daySection,
          '',
          'Key reference blocks:',
          blockSection,
          '',
          'Calendar entries in range:',
          entrySection,
        ].join('\n'),
      },
    ]
  }

  const daySection = input.dayDigests.length > 0
    ? input.dayDigests.map((day, index) => [
      `日期 ${index + 1}`,
      `日期：${day.date}`,
      `块数：${day.blockCount}`,
      `主题：${day.topTags.join('、') || '暂无明显主题'}`,
      `预览：${day.previews.join('；') || '无'}`,
      `安排：计划 ${day.plannedEntryCount} 项，完成 ${day.doneEntryCount} 项，取消 ${day.canceledEntryCount} 项`,
    ].join('\n')).join('\n\n')
    : '最近两周没有日级记录。'

  const blockSection = input.blocks.length > 0
    ? input.blocks.map((block, index) => [
      `引用块 ${index + 1}`,
      `日期：${block.date}`,
      `时间：${block.createdAt}`,
      `标签：${block.tags.join('、') || '无'}`,
      `摘要：${block.summary?.trim() || '无'}`,
      `预览：${block.preview}`,
      '正文：',
      block.content,
    ].join('\n')).join('\n\n---\n\n')
    : '最近两周没有可引用块。'

  const entrySection = input.entries.length > 0
    ? input.entries.map((entry, index) => [
      `安排 ${index + 1}`,
      `日期：${entry.date}`,
      `标题：${entry.title}`,
      `时间：${entry.allDay ? '全天' : entry.startTime ?? '未写时间'}`,
      `状态：${entry.status}`,
      `备注：${entry.notes ?? '无'}`,
    ].join('\n')).join('\n\n')
    : '最近两周没有日历安排。'

  return [
    {
      role: 'system',
      content: [
        '你是长布的 AI 洞察分析助手。',
        '你的任务是严格根据最近两周的块内容和日历安排，按指定分析方法写一篇中文 Markdown 洞察正文。',
        '风格应自然、克制、像一页可阅读的分析文章，不要写成汇报模板、咨询表格、心理测评结果单或空洞鸡汤。',
        '只能整理、串联和解释用户已经写下来的事实，不允许补充原始内容中不存在的事件、结论、关系或结果。',
        '允许做解释性推断，但必须明确写成“可能”“更像”“看起来”“倾向于”之类的表述，不要把推断写成确定事实。',
        '如果使用 CBT 或 MBTI 语言，只能作为观察视角，禁止诊断化、病理化、贴标签或给出确定的人格结论。',
        '允许使用 3 到 5 个二级标题，也可以带少量列表，但不要套固定模板。',
        '不要输出代码块围栏，不要输出 JSON，不要写“以下是分析结果”之类说明语。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `分析方法：${input.methodLabel}`,
        `方法要求：${input.promptPreset}`,
        `锚点日期：${input.anchorDate}`,
        `时间范围：${input.rangeStart} 至 ${input.rangeEnd}`,
        `范围内块数：${input.blockCount}`,
        `范围内日历：计划 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`,
        `高频主题：${input.topTags.join('、') || '暂无明显主题'}`,
        '',
        '以下是 14 天内的日级概览：',
        daySection,
        '',
        '以下是重点引用块：',
        blockSection,
        '',
        '以下是范围内日历安排：',
        entrySection,
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

function sanitizeImageAnnotations(value: unknown): BlockImageAnnotation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const index = typeof item?.index === 'number' ? Math.trunc(item.index) : Number.NaN
      const annotation = typeof item?.annotation === 'string'
        ? item.annotation.trim().replace(/\s+/g, ' ').slice(0, 240)
        : ''

      if (!Number.isInteger(index) || index < 0 || !annotation) {
        return null
      }

      return { index, annotation }
    })
    .filter((item): item is BlockImageAnnotation => Boolean(item))
    .sort((left, right) => left.index - right.index)
}

function sanitizeStructuredTags(
  payload: unknown,
  categoryCandidates: string[],
  detailCandidates: string[],
  userTags: string[],
): TagSuggestionResult {
  const data = payload as {
    categories?: unknown
    detail_tags?: unknown
    detailTags?: unknown
    summary?: unknown
    image_annotations?: unknown
    imageAnnotations?: unknown
  }
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
    imageAnnotations: sanitizeImageAnnotations(data?.image_annotations ?? data?.imageAnnotations),
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
    imageAnnotations: [],
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

function buildTagSuggestionInstructions(formatDescription: string, options: { multimodal: boolean; fallbackToTextOnly: boolean }): string {
  return [
    '你是长布的标签分配助手。',
    formatDescription,
    '分类标签用于大类归档，数量 1 到 3 个。',
    '细标签用于体现块里具体在说什么，数量 1 到 5 个，必须具体，优先名词性内容标签。',
    'summary 是这个块的一句简短总结，用于连接图和块预览，尽量控制在 12 到 30 个汉字之间。',
    options.multimodal
      ? '如果输入里附带图片，请结合图片与文本生成 image_annotations。index 必须对应图片顺序，从 0 开始。annotation 是可用于检索和打标签的简短图片内容批注。'
      : '如果原文里出现图片 Markdown / 图片链接，但这次没有真实图片输入，不能假装看到了图片，只能依据 alt、URL 和上下文谨慎描述。',
    options.fallbackToTextOnly ? '本次图片未被实际分析，禁止虚构图片细节。' : '',
    '细标签要尽量体现设备、产品、考试、方法、概念、项目对象、资料主题等具体内容。',
    '不要用空泛标签替代具体内容，例如不要只写“学习”“生活”“工具”来代替块里真正的对象。',
    '分类标签允许更概括，但细标签必须具体。',
    '优先复用给定的分类候选、细标签记忆和用户标签。',
    '不要把用户标签原样机械复制进输出，只有内容确实匹配时才复用。',
    '不要输出解释、不要输出 Markdown、不要输出额外字段。',
  ].filter(Boolean).join('\n')
}

function buildTextOnlyTagSuggestionUserContent(input: TagSuggestionInput, options: { fallbackToTextOnly: boolean }): string {
  return [
    `分类候选：${input.categoryCandidates.join('、') || '无'}`,
    `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
    `用户标签记忆：${input.userTags.join('、') || '无'}`,
    input.images?.length
      ? `图片输入状态：未发送真实图片，共 ${input.images.length} 张图片${input.skippedImages ? `，另有 ${input.skippedImages} 张跳过` : ''}。`
      : '图片输入状态：无图片。',
    options.fallbackToTextOnly ? '说明：本次只能依据图片 alt / URL / 上下文推断，不能假装已经看图。' : '',
    '',
    '内容如下：',
    input.content,
  ].filter(Boolean).join('\n')
}

function buildMultimodalTagSuggestionUserContent(input: TagSuggestionInput): ChatContentPart[] {
  const parts: ChatContentPart[] = [
    {
      type: 'text',
      text: [
        `分类候选：${input.categoryCandidates.join('、') || '无'}`,
        `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
        `用户标签记忆：${input.userTags.join('、') || '无'}`,
        `真实图片输入：${input.images?.length ?? 0} 张${input.skippedImages ? `，另有 ${input.skippedImages} 张因限制或格式问题未发送` : ''}。`,
        '',
        '文字内容如下：',
        input.content,
      ].join('\n'),
    },
  ]

  for (const image of input.images ?? []) {
    parts.push({
      type: 'text',
      text: `图片 index=${image.index}，alt=${image.altText?.trim() || '无'}。请据此返回对应 image_annotations 条目。`,
    })
    parts.push({
      type: 'image_url',
      image_url: {
        url: image.url,
      },
    })
  }

  return parts
}

function buildTagSuggestionMessages(input: TagSuggestionInput, options: { multimodal: boolean; fallbackToTextOnly: boolean }): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        buildTagSuggestionOutputFormat(options.multimodal),
        options,
      ),
    },
    {
      role: 'user',
      content: options.multimodal
        ? buildMultimodalTagSuggestionUserContent(input)
        : buildTextOnlyTagSuggestionUserContent(input, { fallbackToTextOnly: options.fallbackToTextOnly }),
    },
  ]
}

function buildBatchTagSuggestionMessages(inputs: TagSuggestionInput[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        '请基于用户输入内容输出严格 JSON，格式为 {"items":[{"index":0,"categories":["分类1"],"detail_tags":["细标签1"],"summary":"简短总结"}]}。',
        {
          multimodal: false,
          fallbackToTextOnly: false,
        },
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

function buildMultimodalProbeMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a connectivity probe. Reply with OK if you can read the image input.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Reply with OK only after reading the attached image.',
        },
        {
          type: 'image_url',
          image_url: {
            url: PROBE_IMAGE_DATA_URL,
          },
        },
      ],
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

function estimateMessageContentTokens(content: string | ChatContentPart[]): number {
  if (typeof content === 'string') {
    return estimateTokenCount(content)
  }

  return content.reduce((total, part) => {
    if (part.type === 'text') {
      return total + estimateTokenCount(part.text)
    }

    return total + 256
  }, 0)
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageContentTokens(message.content) + 16, 0)
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
