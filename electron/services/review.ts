import { getAiInsightMethodDefinition } from '../../shared/aiInsights'
import type {
  AIExecutionMode,
  AiInsightMethodId,
  AiInsightResult,
  AiInsightSourceBlock,
  Block,
  CalendarDayDetail,
  CalendarEntry,
  DailyReviewResult,
  DailyReviewSourceBlock,
} from '../../shared/types'
import {
  sanitizeAiInsightResponse,
  sanitizeDailyReviewResponse,
  type AiInsightGenerationInput,
  type DailyReviewGenerationInput,
  type LLMProvider,
} from './ai'

function shiftDateKey(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatLocalDateKey(value: string): string {
  const date = new Date(value)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildBlockPreview(block: Block): string {
  const summary = block.summary?.trim()

  if (summary) {
    return summary
  }

  const firstLine = block.content
    .split('\n')
    .map((line) => stripMarkdown(line))
    .find(Boolean)

  return firstLine ?? '未命名内容'
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function summarizeContent(text: string): string | null {
  const normalized = stripMarkdown(text)
  return normalized ? truncate(normalized, 140) : null
}

function compareByCountThenName(left: [string, number], right: [string, number]): number {
  return right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN')
}

function buildTopTags(blocks: Block[]): string[] {
  const counts = new Map<string, number>()

  for (const block of blocks) {
    for (const tag of block.tags) {
      const name = tag.name.trim()

      if (!name) {
        continue
      }

      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort(compareByCountThenName)
    .slice(0, 6)
    .map(([name]) => name)
}

function sortBlocksByCreatedAt(blocks: Block[]): Block[] {
  return [...blocks].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

function sortEntries(entries: CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date, 'zh-Hans-CN')

    if (dateCompare !== 0) {
      return dateCompare
    }

    if (left.allDay !== right.allDay) {
      return Number(right.allDay) - Number(left.allDay)
    }

    return (left.startTime ?? '').localeCompare(right.startTime ?? '', 'zh-Hans-CN')
  })
}

function buildDailySourceBlocks(blocks: Block[]): DailyReviewSourceBlock[] {
  return sortBlocksByCreatedAt(blocks).map((block) => ({
    id: block.id,
    preview: buildBlockPreview(block),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    tags: block.tags.map((tag) => tag.name),
    summary: block.summary ?? null,
  }))
}

function buildAiSourceBlocks(blocks: Block[]): AiInsightSourceBlock[] {
  return [...blocks]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((block) => ({
      id: block.id,
      date: formatLocalDateKey(block.createdAt),
      preview: buildBlockPreview(block),
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
      tags: block.tags.map((tag) => tag.name),
      summary: block.summary ?? null,
    }))
}

function buildDailyGenerationInput(blocks: Block[], entries: CalendarEntry[], date: string): DailyReviewGenerationInput {
  const sortedBlocks = sortBlocksByCreatedAt(blocks)
  const sortedEntries = sortEntries(entries)

  return {
    date,
    blockCount: blocks.length,
    plannedEntryCount: entries.filter((entry) => entry.status === 'planned').length,
    doneEntryCount: entries.filter((entry) => entry.status === 'done').length,
    canceledEntryCount: entries.filter((entry) => entry.status === 'canceled').length,
    topTags: buildTopTags(blocks),
    blocks: sortedBlocks.map((block) => ({
      id: block.id,
      createdAt: block.createdAt,
      preview: buildBlockPreview(block),
      content: truncate(block.content.trim(), 1_400),
      summary: block.summary ?? null,
      tags: block.tags.map((tag) => tag.name),
    })),
    entries: sortedEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      notes: entry.notes,
      startTime: entry.startTime,
      allDay: entry.allDay,
      status: entry.status,
    })),
  }
}

function scoreInsightBlock(block: Block): number {
  const normalized = stripMarkdown(block.content)

  return (
    Math.min(normalized.length, 720) +
    (block.summary?.trim() ? 180 : 0) +
    block.tags.length * 36 +
    (normalized.includes('。') ? 18 : 0)
  )
}

function selectAiInsightBlocks(blocks: Block[], limit = 12): Block[] {
  if (blocks.length <= limit) {
    return [...blocks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }

  const scored = [...blocks]
    .map((block) => ({
      block,
      date: formatLocalDateKey(block.createdAt),
      score: scoreInsightBlock(block),
      createdAtValue: new Date(block.createdAt).getTime(),
    }))
    .sort((left, right) => right.score - left.score || right.createdAtValue - left.createdAtValue)

  const selected: typeof scored = []
  const selectedIds = new Set<string>()
  const coveredDates = new Set<string>()
  const coverageLimit = Math.min(limit, 7)

  for (const item of scored) {
    if (selected.length >= coverageLimit) {
      break
    }

    if (coveredDates.has(item.date)) {
      continue
    }

    selected.push(item)
    selectedIds.add(item.block.id)
    coveredDates.add(item.date)
  }

  for (const item of scored) {
    if (selected.length >= limit) {
      break
    }

    if (selectedIds.has(item.block.id)) {
      continue
    }

    selected.push(item)
    selectedIds.add(item.block.id)
  }

  return selected
    .map((item) => item.block)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function buildAiInsightGenerationInput(params: {
  methodId: AiInsightMethodId
  anchorDate: string
  dayDetails: CalendarDayDetail[]
}): {
  input: AiInsightGenerationInput
  blocks: Block[]
  entries: CalendarEntry[]
  sourceBlocks: Block[]
} {
  const method = getAiInsightMethodDefinition(params.methodId)

  if (!method) {
    throw new Error('未知的 AI 洞察方法。')
  }

  const dates = buildReviewDateRange(params.anchorDate, params.dayDetails.length || 14)
  const allBlocks = sortBlocksByCreatedAt(params.dayDetails.flatMap((detail) => detail.blocks))
  const allEntries = sortEntries(params.dayDetails.flatMap((detail) => detail.entries))
  const sourceBlocks = selectAiInsightBlocks(allBlocks)

  const blocksByDate = new Map<string, Block[]>()
  const entriesByDate = new Map<string, CalendarEntry[]>()

  for (const block of allBlocks) {
    const dateKey = formatLocalDateKey(block.createdAt)
    const current = blocksByDate.get(dateKey) ?? []
    current.push(block)
    blocksByDate.set(dateKey, current)
  }

  for (const entry of allEntries) {
    const current = entriesByDate.get(entry.date) ?? []
    current.push(entry)
    entriesByDate.set(entry.date, current)
  }

  const dayDigests = dates
    .map((date) => {
      const dayBlocks = blocksByDate.get(date) ?? []
      const dayEntries = entriesByDate.get(date) ?? []

      return {
        date,
        blockCount: dayBlocks.length,
        topTags: buildTopTags(dayBlocks).slice(0, 4),
        previews: dayBlocks.slice(0, 3).map(buildBlockPreview),
        plannedEntryCount: dayEntries.filter((entry) => entry.status === 'planned').length,
        doneEntryCount: dayEntries.filter((entry) => entry.status === 'done').length,
        canceledEntryCount: dayEntries.filter((entry) => entry.status === 'canceled').length,
      }
    })
    .filter((day) => day.blockCount > 0 || day.plannedEntryCount > 0 || day.doneEntryCount > 0 || day.canceledEntryCount > 0)

  return {
    input: {
      methodId: method.id,
      methodLabel: method.label,
      promptPreset: method.promptPreset,
      anchorDate: params.anchorDate,
      rangeStart: dates[0] ?? params.anchorDate,
      rangeEnd: dates[dates.length - 1] ?? params.anchorDate,
      blockCount: allBlocks.length,
      plannedEntryCount: allEntries.filter((entry) => entry.status === 'planned').length,
      doneEntryCount: allEntries.filter((entry) => entry.status === 'done').length,
      canceledEntryCount: allEntries.filter((entry) => entry.status === 'canceled').length,
      topTags: buildTopTags(allBlocks),
      dayDigests,
      blocks: sourceBlocks.map((block) => ({
        id: block.id,
        date: formatLocalDateKey(block.createdAt),
        createdAt: block.createdAt,
        preview: buildBlockPreview(block),
        content: truncate(block.content.trim(), 1_100),
        summary: block.summary ?? null,
        tags: block.tags.map((tag) => tag.name),
      })),
      entries: allEntries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        title: entry.title,
        notes: entry.notes,
        startTime: entry.startTime,
        allDay: entry.allDay,
        status: entry.status,
      })),
    },
    blocks: allBlocks,
    entries: allEntries,
    sourceBlocks,
  }
}

function buildEmptyDailyReview(date: string, mode: AIExecutionMode): DailyReviewResult {
  const title = `每日回顾 ${date}`
  const content = [
    '今天还没有形成可供整理的内容。',
    '',
    '你可以先写下一两条块，或者补上当天的安排；等有了真实记录，这里会自动整理成一篇可阅读的回顾。',
  ].join('\n')

  return {
    date,
    title,
    summary: summarizeContent(content),
    content,
    blockIds: [],
    calendarEntryIds: [],
    blockCount: 0,
    plannedEntryCount: 0,
    doneEntryCount: 0,
    canceledEntryCount: 0,
    topTags: [],
    generatedAt: new Date().toISOString(),
    mode,
    sourceBlocks: [],
    empty: true,
  }
}

function buildEmptyAiInsight(methodId: AiInsightMethodId, anchorDate: string, mode: AIExecutionMode): AiInsightResult {
  const method = getAiInsightMethodDefinition(methodId)

  if (!method) {
    throw new Error('未知的 AI 洞察方法。')
  }

  const dates = buildReviewDateRange(anchorDate)
  const title = `AI 洞察｜${method.label}｜${dates[0]}～${dates[dates.length - 1]}`
  const content = [
    `最近两周还没有足够的记录让「${method.label}」形成稳定分析。`,
    '',
    '你可以先积累几天块内容或安排，再回来生成 AI 洞察。这里会优先依据真实记录来组织结论。',
  ].join('\n')

  return {
    methodId,
    date: anchorDate,
    rangeStart: dates[0] ?? anchorDate,
    rangeEnd: dates[dates.length - 1] ?? anchorDate,
    title,
    summary: summarizeContent(content),
    content,
    blockIds: [],
    calendarEntryIds: [],
    blockCount: 0,
    plannedEntryCount: 0,
    doneEntryCount: 0,
    canceledEntryCount: 0,
    topTags: [],
    generatedAt: new Date().toISOString(),
    mode,
    sourceBlocks: [],
    empty: true,
  }
}

export function buildReviewDateRange(anchorDateKey: string, lookbackDays = 14): string[] {
  const safeDays = Math.max(1, Math.round(lookbackDays))
  const startDateKey = shiftDateKey(anchorDateKey, -(safeDays - 1))
  const dates: string[] = []

  for (let offset = 0; offset < safeDays; offset += 1) {
    dates.push(shiftDateKey(startDateKey, offset))
  }

  return dates
}

export interface PreparedDailyReviewGeneration {
  input: DailyReviewGenerationInput | null
  blocks: Block[]
  entries: CalendarEntry[]
  emptyResult: DailyReviewResult | null
}

export function prepareDailyReviewGeneration(params: {
  date: string
  dayDetail: CalendarDayDetail
  mode: AIExecutionMode
}): PreparedDailyReviewGeneration {
  const { date, dayDetail, mode } = params
  const blocks = dayDetail.blocks
  const entries = dayDetail.entries
  const input = buildDailyGenerationInput(blocks, entries, date)

  if (input.blockCount === 0 && input.entries.length === 0) {
    return {
      input: null,
      blocks,
      entries,
      emptyResult: buildEmptyDailyReview(date, mode),
    }
  }

  return {
    input,
    blocks,
    entries,
    emptyResult: null,
  }
}

export function finalizeDailyReviewResult(params: {
  date: string
  mode: AIExecutionMode
  input: DailyReviewGenerationInput
  blocks: Block[]
  entries: CalendarEntry[]
  content: string
}): DailyReviewResult {
  const safeContent = sanitizeDailyReviewResponse(params.content).trim()

  if (!safeContent) {
    throw new Error('每日回顾生成失败：模型没有返回内容。')
  }

  const title = `每日回顾 ${params.date}`

  return {
    date: params.date,
    title,
    summary: summarizeContent(safeContent),
    content: safeContent,
    blockIds: params.blocks.map((block) => block.id),
    calendarEntryIds: params.entries.map((entry) => entry.id),
    blockCount: params.input.blockCount,
    plannedEntryCount: params.input.plannedEntryCount,
    doneEntryCount: params.input.doneEntryCount,
    canceledEntryCount: params.input.canceledEntryCount,
    topTags: params.input.topTags,
    generatedAt: new Date().toISOString(),
    mode: params.mode,
    sourceBlocks: buildDailySourceBlocks(params.blocks),
    empty: false,
  }
}

export interface PreparedAiInsightGeneration {
  input: AiInsightGenerationInput | null
  blocks: Block[]
  entries: CalendarEntry[]
  sourceBlocks: Block[]
  emptyResult: AiInsightResult | null
}

export function prepareAiInsightGeneration(params: {
  methodId: AiInsightMethodId
  anchorDate: string
  dayDetails: CalendarDayDetail[]
  mode: AIExecutionMode
}): PreparedAiInsightGeneration {
  const { methodId, anchorDate, dayDetails, mode } = params
  const method = getAiInsightMethodDefinition(methodId)

  if (!method) {
    throw new Error('未知的 AI 洞察方法。')
  }

  const prepared = buildAiInsightGenerationInput({
    methodId,
    anchorDate,
    dayDetails,
  })

  if (prepared.input.blockCount === 0 && prepared.input.entries.length === 0) {
    return {
      input: null,
      blocks: prepared.blocks,
      entries: prepared.entries,
      sourceBlocks: prepared.sourceBlocks,
      emptyResult: buildEmptyAiInsight(methodId, anchorDate, mode),
    }
  }

  return {
    input: prepared.input,
    blocks: prepared.blocks,
    entries: prepared.entries,
    sourceBlocks: prepared.sourceBlocks,
    emptyResult: null,
  }
}

export function finalizeAiInsightResult(params: {
  methodId: AiInsightMethodId
  anchorDate: string
  mode: AIExecutionMode
  input: AiInsightGenerationInput
  blocks: Block[]
  entries: CalendarEntry[]
  sourceBlocks: Block[]
  content: string
}): AiInsightResult {
  const method = getAiInsightMethodDefinition(params.methodId)

  if (!method) {
    throw new Error('未知的 AI 洞察方法。')
  }

  const safeContent = sanitizeAiInsightResponse(params.content).trim()

  if (!safeContent) {
    throw new Error('AI 洞察生成失败：模型没有返回内容。')
  }

  const title = `AI 洞察｜${method.label}｜${params.input.rangeStart}～${params.input.rangeEnd}`

  return {
    methodId: params.methodId,
    date: params.anchorDate,
    rangeStart: params.input.rangeStart,
    rangeEnd: params.input.rangeEnd,
    title,
    summary: summarizeContent(safeContent),
    content: safeContent,
    blockIds: params.blocks.map((block) => block.id),
    calendarEntryIds: params.entries.map((entry) => entry.id),
    blockCount: params.input.blockCount,
    plannedEntryCount: params.input.plannedEntryCount,
    doneEntryCount: params.input.doneEntryCount,
    canceledEntryCount: params.input.canceledEntryCount,
    topTags: params.input.topTags,
    generatedAt: new Date().toISOString(),
    mode: params.mode,
    sourceBlocks: buildAiSourceBlocks(params.sourceBlocks),
    empty: false,
  }
}

export async function generateDailyReview(params: {
  date: string
  dayDetail: CalendarDayDetail
  llmProvider: LLMProvider
  mode: AIExecutionMode
}): Promise<DailyReviewResult> {
  const prepared = prepareDailyReviewGeneration({
    date: params.date,
    dayDetail: params.dayDetail,
    mode: params.mode,
  })

  if (prepared.emptyResult) {
    return prepared.emptyResult
  }

  const generationInput = prepared.input

  if (!generationInput) {
    throw new Error('每日回顾生成输入缺失。')
  }

  const content = await params.llmProvider.generateDailyReview(generationInput)

  return finalizeDailyReviewResult({
    date: params.date,
    mode: params.mode,
    input: generationInput,
    blocks: prepared.blocks,
    entries: prepared.entries,
    content,
  })
}

export async function generateAiInsight(params: {
  methodId: AiInsightMethodId
  anchorDate: string
  dayDetails: CalendarDayDetail[]
  llmProvider: LLMProvider
  mode: AIExecutionMode
}): Promise<AiInsightResult> {
  const prepared = prepareAiInsightGeneration({
    methodId: params.methodId,
    anchorDate: params.anchorDate,
    dayDetails: params.dayDetails,
    mode: params.mode,
  })

  if (prepared.emptyResult) {
    return prepared.emptyResult
  }

  const generationInput = prepared.input

  if (!generationInput) {
    throw new Error('AI 洞察生成输入缺失。')
  }

  const content = await params.llmProvider.generateAiInsight(generationInput)

  return finalizeAiInsightResult({
    methodId: params.methodId,
    anchorDate: params.anchorDate,
    mode: params.mode,
    input: generationInput,
    blocks: prepared.blocks,
    entries: prepared.entries,
    sourceBlocks: prepared.sourceBlocks,
    content,
  })
}

export function buildDailyReviewSnapshotContent(title: string, content: string): string {
  const safeTitle = title.trim()
  const safeContent = content.trim()

  if (!safeContent) {
    throw new Error('每日回顾内容不能为空。')
  }

  if (safeContent.startsWith('# ')) {
    return safeContent
  }

  return `# ${safeTitle}\n\n${safeContent}`
}

export function buildAiInsightSnapshotContent(title: string, content: string): string {
  const safeTitle = title.trim()
  const safeContent = content.trim()

  if (!safeContent) {
    throw new Error('AI 洞察内容不能为空。')
  }

  if (safeContent.startsWith('# ')) {
    return safeContent
  }

  return `# ${safeTitle}\n\n${safeContent}`
}
