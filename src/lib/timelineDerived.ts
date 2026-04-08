import type { Block } from '../../shared/types'
import type { BlockListChangeHint } from './blockListCache'
import { formatLocalDateKey } from './format'
import { buildMiniTimelineGroups, type MiniTimelineGroup } from './miniTimeline'
import { buildTimelineDateCountMap } from './timelineSidebar'

export interface TimelineDateCountState {
  dateCounts: Map<string, number>
  availableDateKeys: Set<string>
}

export interface MiniTimelineDerivedState {
  totalBlocks: number
  groups: MiniTimelineGroup[]
  groupByStartIndex: Map<number, MiniTimelineGroup>
}

type MiniTimelineGroupSeed = Omit<MiniTimelineGroup, 'positionRatio'>

function finalizeMiniTimelineState(seeds: MiniTimelineGroupSeed[], totalBlocks: number): MiniTimelineDerivedState {
  if (seeds.length === 0 || totalBlocks === 0) {
    return {
      totalBlocks: 0,
      groups: [],
      groupByStartIndex: new Map(),
    }
  }

  const maxIndex = Math.max(1, totalBlocks - 1)
  const groups = seeds.map((group) => ({
    ...group,
    positionRatio: seeds.length === 1 ? 0.5 : group.startIndex / maxIndex,
  }))

  return {
    totalBlocks,
    groups,
    groupByStartIndex: new Map(groups.map((group) => [group.startIndex, group])),
  }
}

function toSeed(group: MiniTimelineGroup): MiniTimelineGroupSeed {
  return {
    key: group.key,
    label: group.label,
    title: group.title,
    startIndex: group.startIndex,
    count: group.count,
  }
}

function adjustTimelineCount(nextCounts: Map<string, number>, dateKey: string, delta: number): void {
  const nextCount = (nextCounts.get(dateKey) ?? 0) + delta

  if (nextCount <= 0) {
    nextCounts.delete(dateKey)
    return
  }

  nextCounts.set(dateKey, nextCount)
}

export function buildTimelineDateCountState(blocks: Block[]): TimelineDateCountState {
  const dateCounts = buildTimelineDateCountMap(blocks)

  return {
    dateCounts,
    availableDateKeys: new Set(dateCounts.keys()),
  }
}

export function reconcileTimelineDateCountState(
  previousState: TimelineDateCountState | null,
  blocks: Block[],
  changeHint: BlockListChangeHint,
): TimelineDateCountState {
  if (!previousState || changeHint.type === 'reset' || changeHint.type === 'noop') {
    return buildTimelineDateCountState(blocks)
  }

  switch (changeHint.type) {
    case 'append':
    case 'prepend': {
      const nextCounts = new Map(previousState.dateCounts)

      for (const block of changeHint.blocks) {
        adjustTimelineCount(nextCounts, formatLocalDateKey(block.createdAt), 1)
      }

      return {
        dateCounts: nextCounts,
        availableDateKeys: new Set(nextCounts.keys()),
      }
    }
    case 'replace': {
      const previousDateKey = changeHint.previousBlock ? formatLocalDateKey(changeHint.previousBlock.createdAt) : null
      const nextDateKey = formatLocalDateKey(changeHint.block.createdAt)

      if (!previousDateKey || previousDateKey === nextDateKey) {
        return previousState
      }

      const nextCounts = new Map(previousState.dateCounts)
      adjustTimelineCount(nextCounts, previousDateKey, -1)
      adjustTimelineCount(nextCounts, nextDateKey, 1)

      return {
        dateCounts: nextCounts,
        availableDateKeys: new Set(nextCounts.keys()),
      }
    }
    case 'remove': {
      if (!changeHint.removedBlock) {
        return previousState
      }

      const nextCounts = new Map(previousState.dateCounts)
      adjustTimelineCount(nextCounts, formatLocalDateKey(changeHint.removedBlock.createdAt), -1)

      return {
        dateCounts: nextCounts,
        availableDateKeys: new Set(nextCounts.keys()),
      }
    }
    case 'remove-many': {
      if (changeHint.removedBlocks.length === 0) {
        return previousState
      }

      const nextCounts = new Map(previousState.dateCounts)

      for (const removedBlock of changeHint.removedBlocks) {
        adjustTimelineCount(nextCounts, formatLocalDateKey(removedBlock.createdAt), -1)
      }

      return {
        dateCounts: nextCounts,
        availableDateKeys: new Set(nextCounts.keys()),
      }
    }
  }
}

export function buildMiniTimelineDerivedState(blocks: Block[]): MiniTimelineDerivedState {
  const groups = buildMiniTimelineGroups(blocks)

  return {
    totalBlocks: blocks.length,
    groups,
    groupByStartIndex: new Map(groups.map((group) => [group.startIndex, group])),
  }
}

function appendMiniTimelineState(
  previousState: MiniTimelineDerivedState,
  appendedBlocks: Block[],
): MiniTimelineDerivedState {
  if (appendedBlocks.length === 0) {
    return previousState
  }

  const currentSeeds = previousState.groups.map(toSeed)
  const appendedSeeds = buildMiniTimelineGroups(appendedBlocks).map(toSeed)
  const nextSeeds = currentSeeds.slice()
  let appendedIndex = 0

  if (nextSeeds.length > 0 && appendedSeeds.length > 0 && nextSeeds.at(-1)?.key === appendedSeeds[0]?.key) {
    const lastGroup = nextSeeds.at(-1)
    const firstAppendedGroup = appendedSeeds[0]

    if (lastGroup && firstAppendedGroup) {
      nextSeeds[nextSeeds.length - 1] = {
        ...lastGroup,
        count: lastGroup.count + firstAppendedGroup.count,
        title: firstAppendedGroup.title,
      }
      appendedIndex = 1
    }
  }

  for (; appendedIndex < appendedSeeds.length; appendedIndex += 1) {
    const seed = appendedSeeds[appendedIndex]

    if (!seed) {
      continue
    }

    nextSeeds.push({
      ...seed,
      startIndex: previousState.totalBlocks + seed.startIndex,
    })
  }

  return finalizeMiniTimelineState(nextSeeds, previousState.totalBlocks + appendedBlocks.length)
}

function prependMiniTimelineState(
  previousState: MiniTimelineDerivedState,
  prependedBlocks: Block[],
): MiniTimelineDerivedState {
  if (prependedBlocks.length === 0) {
    return previousState
  }

  const prependedSeeds = buildMiniTimelineGroups(prependedBlocks).map(toSeed)
  const shiftedCurrentSeeds = previousState.groups.map((group) => ({
    ...toSeed(group),
    startIndex: group.startIndex + prependedBlocks.length,
  }))
  const nextSeeds = prependedSeeds.slice()

  if (nextSeeds.length > 0 && shiftedCurrentSeeds.length > 0 && nextSeeds.at(-1)?.key === shiftedCurrentSeeds[0]?.key) {
    const lastPrependedGroup = nextSeeds.at(-1)
    const firstCurrentGroup = shiftedCurrentSeeds[0]

    if (lastPrependedGroup && firstCurrentGroup) {
      nextSeeds[nextSeeds.length - 1] = {
        ...lastPrependedGroup,
        count: lastPrependedGroup.count + firstCurrentGroup.count,
        title: firstCurrentGroup.title,
      }
      shiftedCurrentSeeds.shift()
    }
  }

  nextSeeds.push(...shiftedCurrentSeeds)

  return finalizeMiniTimelineState(nextSeeds, previousState.totalBlocks + prependedBlocks.length)
}

export function reconcileMiniTimelineDerivedState(
  previousState: MiniTimelineDerivedState | null,
  blocks: Block[],
  changeHint: BlockListChangeHint,
): MiniTimelineDerivedState {
  if (!previousState || changeHint.type === 'reset' || changeHint.type === 'noop') {
    return buildMiniTimelineDerivedState(blocks)
  }

  switch (changeHint.type) {
    case 'append':
      return appendMiniTimelineState(previousState, changeHint.blocks)
    case 'prepend':
      return prependMiniTimelineState(previousState, changeHint.blocks)
    case 'replace': {
      const previousDateKey = changeHint.previousBlock ? formatLocalDateKey(changeHint.previousBlock.createdAt) : null
      const nextDateKey = formatLocalDateKey(changeHint.block.createdAt)
      return previousDateKey === nextDateKey ? previousState : buildMiniTimelineDerivedState(blocks)
    }
    case 'remove':
    case 'remove-many':
      return buildMiniTimelineDerivedState(blocks)
  }
}
