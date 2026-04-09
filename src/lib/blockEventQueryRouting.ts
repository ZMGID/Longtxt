import type { QueryClient, QueryKey } from '@tanstack/react-query'

import type { Block, BlockChangedEvent, CalendarDayDetail } from '../../shared/types'
import { formatLocalDateKey } from './format'
import { queryKeys } from './queryKeys'

const REVIEW_INSIGHT_LOOKBACK_DAYS = 14

function isValidDate(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function getBlockDateKey(block: Block): string | null {
  return isValidDate(block.createdAt) ? formatLocalDateKey(block.createdAt) : null
}

function getBlockYear(block: Block): number | null {
  if (!isValidDate(block.createdAt)) {
    return null
  }

  return new Date(block.createdAt).getFullYear()
}

function compareImageAnnotations(
  left: Block['imageAnnotations'],
  right: Block['imageAnnotations'],
): boolean {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((annotation, index) => {
    const other = normalizedRight[index]

    return Boolean(other)
      && annotation.index === other.index
      && annotation.annotation === other.annotation
  })
}

function compareTags(left: Block['tags'], right: Block['tags']): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((tag, index) => {
    const other = right[index]

    return Boolean(other)
      && tag.id === other.id
      && tag.name === other.name
      && tag.isDefault === other.isDefault
      && tag.source === other.source
      && tag.kind === other.kind
  })
}

function areBlocksEquivalent(left: Block, right: Block): boolean {
  return left.id === right.id
    && left.content === right.content
    && left.summary === right.summary
    && compareImageAnnotations(left.imageAnnotations, right.imageAnnotations)
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.status === right.status
    && left.aiMode === right.aiMode
    && left.errorMessage === right.errorMessage
    && compareTags(left.tags, right.tags)
}

function compareBlocksByDate(left: Block, right: Block): number {
  const createdAtDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()

  if (createdAtDiff !== 0) {
    return createdAtDiff
  }

  return right.id.localeCompare(left.id)
}

function upsertBlockIntoDateBlocks(current: Block[], block: Block): Block[] {
  const index = current.findIndex((item) => item.id === block.id)

  if (index >= 0) {
    const previous = current[index]

    if (previous && areBlocksEquivalent(previous, block)) {
      return current
    }

    const nextBlocks = current.slice()
    nextBlocks[index] = block
    return nextBlocks
  }

  return [...current, block].sort(compareBlocksByDate)
}

function removeBlockFromDateBlocks(current: Block[], blockId: string): Block[] {
  const index = current.findIndex((item) => item.id === blockId)

  if (index < 0) {
    return current
  }

  return current.filter((item) => item.id !== blockId)
}

export function applyBlockChangedEventToDateBlocks(current: Block[], event: BlockChangedEvent, dateKey: string): Block[] {
  const blockDateKey = getBlockDateKey(event.block)

  switch (event.reason) {
    case 'created':
      return blockDateKey === dateKey ? upsertBlockIntoDateBlocks(current, event.block) : current
    case 'deleted':
      return removeBlockFromDateBlocks(current, event.block.id)
    case 'updated':
    case 'enriched':
    case 'tagged':
      if (blockDateKey === dateKey) {
        return upsertBlockIntoDateBlocks(current, event.block)
      }

      return removeBlockFromDateBlocks(current, event.block.id)
    default:
      return current
  }
}

export function applyBlockChangedEventsToDateBlocks(current: Block[], events: BlockChangedEvent[], dateKey: string): Block[] {
  return events.reduce((blocks, event) => applyBlockChangedEventToDateBlocks(blocks, event, dateKey), current)
}

export function applyBlockChangedEventsToCalendarDayDetail(
  current: CalendarDayDetail,
  events: BlockChangedEvent[],
): CalendarDayDetail {
  const nextBlocks = applyBlockChangedEventsToDateBlocks(current.blocks, events, current.date)

  if (nextBlocks === current.blocks) {
    return current
  }

  return {
    ...current,
    blocks: nextBlocks,
    blockCount: nextBlocks.length,
  }
}

export interface BlockEventInvalidationImpact {
  invalidateTags: boolean
  invalidateGraph: boolean
  invalidateDataManagement: boolean
  invalidateBlockCleanupDays: boolean
  invalidateCalendarYears: boolean
  heatmapYears: number[]
  reviewDates: string[]
}

export function getBlockEventInvalidationImpact(events: BlockChangedEvent[]): BlockEventInvalidationImpact {
  const reviewDates = new Set<string>()
  const heatmapYears = new Set<number>()
  let invalidateTags = false
  const invalidateGraph = events.length > 0
  let invalidateDataManagement = false
  let invalidateBlockCleanupDays = false
  let invalidateCalendarYears = false

  for (const event of events) {
    const dateKey = getBlockDateKey(event.block)

    if (dateKey) {
      reviewDates.add(dateKey)
    }

    if (event.reason === 'tagged' || event.reason === 'enriched') {
      invalidateTags = true
    }

    if (event.reason === 'created' || event.reason === 'deleted') {
      invalidateDataManagement = true
      invalidateBlockCleanupDays = true
      invalidateCalendarYears = true

      const year = getBlockYear(event.block)

      if (year !== null) {
        heatmapYears.add(year)
      }
    }
  }

  return {
    invalidateTags,
    invalidateGraph,
    invalidateDataManagement,
    invalidateBlockCleanupDays,
    invalidateCalendarYears,
    heatmapYears: Array.from(heatmapYears).sort((left, right) => left - right),
    reviewDates: Array.from(reviewDates).sort(),
  }
}

function getBlocksByDateKey(queryKey: QueryKey): string | null {
  return queryKey[0] === 'blocks' && queryKey[1] === 'by-date' && typeof queryKey[2] === 'string'
    ? queryKey[2]
    : null
}

function getCalendarDayKey(queryKey: QueryKey): string | null {
  return queryKey[0] === 'calendar' && queryKey[1] === 'day' && typeof queryKey[2] === 'string'
    ? queryKey[2]
    : null
}

function getReviewDailyDate(queryKey: QueryKey): string | null {
  return queryKey[0] === 'review' && queryKey[1] === 'daily' && typeof queryKey[3] === 'string'
    ? queryKey[3]
    : null
}

function shiftDateKey(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function getReviewInsightAnchorDate(queryKey: QueryKey): string | null {
  return queryKey[0] === 'review' && queryKey[1] === 'insight' && typeof queryKey[4] === 'string'
    ? queryKey[4]
    : null
}

export function updateBlocksByDateCaches(queryClient: QueryClient, events: BlockChangedEvent[]): void {
  if (events.length === 0) {
    return
  }

  const cachedEntries = queryClient.getQueriesData<Block[]>({
    queryKey: queryKeys.blocksByDateRoot(),
  })

  for (const [queryKey, current] of cachedEntries) {
    const dateKey = getBlocksByDateKey(queryKey)

    if (!dateKey || !current) {
      continue
    }

    const nextBlocks = applyBlockChangedEventsToDateBlocks(current, events, dateKey)

    if (nextBlocks !== current) {
      queryClient.setQueryData<Block[]>(queryKey, nextBlocks)
    }
  }
}

export function updateCalendarDayCaches(queryClient: QueryClient, events: BlockChangedEvent[]): void {
  if (events.length === 0) {
    return
  }

  const cachedEntries = queryClient.getQueriesData<CalendarDayDetail>({
    queryKey: queryKeys.calendarDayRoot(),
  })

  for (const [queryKey, current] of cachedEntries) {
    const dateKey = getCalendarDayKey(queryKey)

    if (!dateKey || !current) {
      continue
    }

    const nextDetail = applyBlockChangedEventsToCalendarDayDetail(current, events)

    if (nextDetail !== current) {
      queryClient.setQueryData<CalendarDayDetail>(queryKey, nextDetail)
    }
  }
}

export function collectReviewQueryKeysToInvalidate(queryClient: QueryClient, affectedDates: string[]): QueryKey[] {
  if (affectedDates.length === 0) {
    return []
  }

  const affectedDateSet = new Set(affectedDates)
  const matchedKeys = new Map<string, QueryKey>()

  const dailyQueries = queryClient.getQueriesData({
    queryKey: queryKeys.reviewDailyRoot(),
  })

  for (const [queryKey] of dailyQueries) {
    const dateKey = getReviewDailyDate(queryKey)

    if (dateKey && affectedDateSet.has(dateKey)) {
      matchedKeys.set(JSON.stringify(queryKey), queryKey)
    }
  }

  const insightQueries = queryClient.getQueriesData({
    queryKey: queryKeys.reviewInsightRoot(),
  })

  for (const [queryKey] of insightQueries) {
    const anchorDateKey = getReviewInsightAnchorDate(queryKey)

    if (!anchorDateKey) {
      continue
    }

    const reviewWindowStart = shiftDateKey(anchorDateKey, -(REVIEW_INSIGHT_LOOKBACK_DAYS - 1))
    const intersects = affectedDates.some((dateKey) => dateKey >= reviewWindowStart && dateKey <= anchorDateKey)

    if (intersects) {
      matchedKeys.set(JSON.stringify(queryKey), queryKey)
    }
  }

  return Array.from(matchedKeys.values())
}
