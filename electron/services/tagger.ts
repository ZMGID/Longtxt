import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'

import type { LLMProvider, TagSuggestionBatchOptions, TagSuggestionImageInput } from './ai-types'
import { DEFAULT_TAG_DEFINITIONS, STRONG_TAG_HINTS, TAG_STOPWORDS, TECH_SIGNAL_PATTERNS } from './defaultTags'

const LOW_CONFIDENCE_THRESHOLD = 1.25
const HIGH_CONFIDENCE_THRESHOLD = 2.6
const jieba = Jieba.withDict(dict)

export interface TaggerAssignOptions {
  corpusContents: string[]
  liveLlmProvider?: LLMProvider | null
  batchOptions?: TagSuggestionBatchOptions
  imageInputs?: TagSuggestionImageInput[]
  skippedImageCount?: number
  tagMemory?: {
    categories: string[]
    details: string[]
    users: string[]
  }
}

export interface TagAssignmentResult {
  categories: string[]
  detailTags: string[]
  summary: string | null
  imageAnnotations: Array<{ index: number; annotation: string }>
  confidence: number
  usedFallback: boolean
}

export interface TaggerEngine {
  assign(content: string, options: TaggerAssignOptions): Promise<TagAssignmentResult>
  assignBatch(items: Array<{ content: string; options: TaggerAssignOptions }>): Promise<TagAssignmentResult[]>
}

function normalizeToken(token: string): string {
  return token.trim().toLowerCase()
}

function tokenizeContent(text: string): string[] {
  const jiebaTokens = jieba.cut(text, false).map(normalizeToken)
  const latinTokens = text.match(/[A-Za-z0-9_-]{2,}/g)?.map(normalizeToken) ?? []

  return Array.from(
    new Set(
      [...jiebaTokens, ...latinTokens].filter((token) => token && !TAG_STOPWORDS.has(token) && token.length > 1),
    ),
  )
}

function computeTermFrequency(tokens: string[]): Map<string, number> {
  const frequency = new Map<string, number>()

  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1)
  }

  return frequency
}

function computeDocumentFrequency(corpusContents: string[]): Map<string, number> {
  const documentFrequency = new Map<string, number>()

  for (const content of corpusContents) {
    const uniqueTokens = new Set(tokenizeContent(content))

    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  return documentFrequency
}

function scoreDefaultTags(content: string, corpusContents: string[]): Array<{ name: string; score: number }> {
  const tokens = tokenizeContent(content)
  const tf = computeTermFrequency(tokens)
  const df = computeDocumentFrequency(corpusContents)
  const documentCount = Math.max(corpusContents.length, 1)
  const lowerContent = content.toLowerCase()

  const hasTechnicalSignals = TECH_SIGNAL_PATTERNS.some((pattern) => pattern.test(content))

  return DEFAULT_TAG_DEFINITIONS.map((definition) => {
    let score = 0

    for (const keyword of definition.keywords) {
      const normalizedKeyword = normalizeToken(keyword)
      const termFrequency = tf.get(normalizedKeyword) ?? 0
      const inverseDocumentFrequency = Math.log((documentCount + 1) / ((df.get(normalizedKeyword) ?? 0) + 1)) + 1

      score += termFrequency * inverseDocumentFrequency

      if (lowerContent.includes(normalizedKeyword)) {
        score += termFrequency > 0 ? 0.6 : 0.35
      }
    }

    const strongHints = STRONG_TAG_HINTS[definition.name] ?? []
    if (strongHints.some((pattern) => pattern.test(content))) {
      score += 1.1
    }

    if (definition.name === '日记' && hasTechnicalSignals && !/(日记|心情|日常|经历)/.test(content)) {
      score -= 1.2
    }

    if (definition.name === '摘录' && !/(摘录|摘抄|原句|引用)/.test(content)) {
      score -= 0.5
    }

    if (definition.name === '复盘' && !/(复盘|回顾|教训|得失|改进)/.test(content)) {
      score -= 0.35
    }

    return {
      name: definition.name,
      score: Number(score.toFixed(4)),
    }
  }).sort((left, right) => right.score - left.score)
}

function pickRuleTags(scoredTags: Array<{ name: string; score: number }>): TagAssignmentResult {
  const matched = scoredTags.filter((item) => item.score >= 0.75)
  const categorySet = new Set(['生活', '学习', '工作', '创意', '内容', '技术'])
  const categories = matched
    .filter((item) => categorySet.has(item.name))
    .slice(0, 3)
    .map((item) => item.name)
  const detailTags = matched
    .filter((item) => !categorySet.has(item.name))
    .slice(0, 5)
    .map((item) => item.name)
  const confidence = matched[0]?.score ?? 0

  return {
    categories,
    detailTags,
    summary: null,
    imageAnnotations: [],
    confidence,
    usedFallback: false,
  }
}

function buildFallbackSummary(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim()
  if (flattened.length <= 28) {
    return flattened
  }
  return `${flattened.slice(0, 28)}…`
}

function pickRuleCandidates(scoredTags: Array<{ name: string; score: number }>): { categories: string[]; details: string[] } {
  const categorySet = new Set(['生活', '学习', '工作', '创意', '内容', '技术'])
  const positiveTags = scoredTags
    .filter((item) => item.score > 0)
    .slice(0, 12)
    .map((item) => item.name)

  return {
    categories: positiveTags.filter((tag) => categorySet.has(tag)).slice(0, 6),
    details: positiveTags.filter((tag) => !categorySet.has(tag)).slice(0, 8),
  }
}

interface PreparedTagAssignment {
  content: string
  ruleResult: TagAssignmentResult
  llmInput: {
    content: string
    categoryCandidates: string[]
    detailCandidates: string[]
    userTags: string[]
    images: TagSuggestionImageInput[]
    skippedImages: number
  }
  liveLlmProvider: LLMProvider | null
  batchOptions?: TagSuggestionBatchOptions
}

function prepareTagAssignment(content: string, options: TaggerAssignOptions): PreparedTagAssignment {
  const corpusContents = options.corpusContents.length > 0 ? options.corpusContents : [content]
  const scoredTags = scoreDefaultTags(content, corpusContents)
  const ruleResult = pickRuleTags(scoredTags)
  const ruleCandidates = pickRuleCandidates(scoredTags)

  return {
    content,
    ruleResult,
    llmInput: {
      content,
      categoryCandidates: options.tagMemory?.categories ?? ruleCandidates.categories,
      detailCandidates: Array.from(new Set([...(options.tagMemory?.details ?? []), ...ruleCandidates.details])),
      userTags: options.tagMemory?.users ?? [],
      images: options.imageInputs ?? [],
      skippedImages: options.skippedImageCount ?? 0,
    },
    liveLlmProvider: options.liveLlmProvider ?? null,
    batchOptions: options.batchOptions,
  }
}

function isSameBatchOptions(
  left: TagSuggestionBatchOptions | undefined,
  right: TagSuggestionBatchOptions | undefined,
): boolean {
  return (left?.maxBatchBlocks ?? null) === (right?.maxBatchBlocks ?? null)
    && (left?.responseReserveTokens ?? null) === (right?.responseReserveTokens ?? null)
}

function resolveTagAssignment(
  prepared: PreparedTagAssignment,
  llmTags?: {
    categories: string[]
    detailTags: string[]
    summary: string | null
    imageAnnotations: Array<{ index: number; annotation: string }>
  } | null,
): TagAssignmentResult {
  if (llmTags && (llmTags.categories.length > 0 || llmTags.detailTags.length > 0 || llmTags.imageAnnotations.length > 0 || llmTags.summary)) {
    return {
      categories: llmTags.categories.slice(0, 3),
      detailTags: llmTags.detailTags.slice(0, 5),
      summary: llmTags.summary ?? buildFallbackSummary(prepared.content),
      imageAnnotations: llmTags.imageAnnotations,
      confidence: prepared.ruleResult.confidence,
      usedFallback: false,
    }
  }

  if (
    (prepared.ruleResult.categories.length > 0 || prepared.ruleResult.detailTags.length > 0)
    && prepared.ruleResult.confidence >= HIGH_CONFIDENCE_THRESHOLD
  ) {
    return prepared.ruleResult
  }

  if (!prepared.liveLlmProvider) {
    if (prepared.ruleResult.categories.length > 0 || prepared.ruleResult.detailTags.length > 0) {
      return prepared.ruleResult
    }

    return {
      categories: ['创意'],
      detailTags: ['想法', '临时'],
      summary: buildFallbackSummary(prepared.content),
      imageAnnotations: [],
      confidence: 0,
      usedFallback: true,
    }
  }

  if (
    (prepared.ruleResult.categories.length > 0 || prepared.ruleResult.detailTags.length > 0)
    && prepared.ruleResult.confidence >= LOW_CONFIDENCE_THRESHOLD
  ) {
    return prepared.ruleResult
  }

  if (prepared.ruleResult.categories.length > 0 || prepared.ruleResult.detailTags.length > 0) {
    return {
      categories: prepared.ruleResult.categories,
      detailTags: prepared.ruleResult.detailTags,
      summary: buildFallbackSummary(prepared.content),
      imageAnnotations: [],
      confidence: prepared.ruleResult.confidence,
      usedFallback: true,
    }
  }

  return {
    categories: ['创意'],
    detailTags: ['想法', '临时'],
    summary: buildFallbackSummary(prepared.content),
    imageAnnotations: [],
    confidence: 0,
    usedFallback: true,
  }
}

export function createTaggerEngine(): TaggerEngine {
  const assignBatch = async (items: Array<{ content: string; options: TaggerAssignOptions }>): Promise<TagAssignmentResult[]> => {
    const prepared = items.map((item) => prepareTagAssignment(item.content, item.options))
    const sharedLiveProvider = prepared[0]?.liveLlmProvider ?? null
    const sharedBatchOptions = prepared[0]?.batchOptions
    const canBatchWithLiveProvider =
      Boolean(sharedLiveProvider)
      && prepared.every((item) => item.liveLlmProvider === sharedLiveProvider && isSameBatchOptions(item.batchOptions, sharedBatchOptions))

    if (canBatchWithLiveProvider && sharedLiveProvider) {
      if (prepared.some((item) => item.llmInput.images.length > 0)) {
        const results: TagAssignmentResult[] = []

        for (const item of prepared) {
          const llmTags = item.liveLlmProvider
            ? await item.liveLlmProvider.suggestTags(item.llmInput)
            : null
          results.push(resolveTagAssignment(item, llmTags))
        }

        return results
      }

      const llmResults = await sharedLiveProvider.suggestTagsBatch(
        prepared.map((item) => item.llmInput),
        sharedBatchOptions,
      )
      return prepared.map((item, index) => resolveTagAssignment(item, llmResults[index] ?? null))
    }

    const results: TagAssignmentResult[] = []

    for (const item of prepared) {
      const llmTags = item.liveLlmProvider
        ? await item.liveLlmProvider.suggestTags(item.llmInput)
        : null
      results.push(resolveTagAssignment(item, llmTags))
    }

    return results
  }

  return {
    async assign(content, options) {
      const [result] = await assignBatch([{ content, options }])
      return result
    },

    async assignBatch(items) {
      return assignBatch(items)
    },
  }
}
