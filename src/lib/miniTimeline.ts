import type { Block } from '../../shared/types'

export interface MiniTimelineGroup {
  key: string
  label: string
  title: string
  startIndex: number
  count: number
  positionRatio: number
}

export function buildMiniTimelineGroups(blocks: Block[]): MiniTimelineGroup[] {
  if (blocks.length === 0) {
    return []
  }

  const groups: Array<Omit<MiniTimelineGroup, 'positionRatio'>> = []

  blocks.forEach((block, index) => {
    const key = formatTimelineDateKey(block.createdAt)
    const previousGroup = groups.at(-1)

    if (previousGroup?.key === key) {
      previousGroup.count += 1
      previousGroup.title = formatMiniTimelineTitle(block.createdAt, previousGroup.count)
      return
    }

    groups.push({
      key,
      label: formatMiniTimelineLabel(block.createdAt),
      title: formatMiniTimelineTitle(block.createdAt, 1),
      startIndex: index,
      count: 1,
    })
  })

  if (groups.length === 1) {
    return groups.map((group) => ({ ...group, positionRatio: 0.5 }))
  }

  const maxIndex = Math.max(1, blocks.length - 1)

  return groups.map((group) => ({
    ...group,
    positionRatio: group.startIndex / maxIndex,
  }))
}

export function getActiveMiniTimelineGroupKey(groups: MiniTimelineGroup[], topVisibleIndex: number): string | null {
  if (groups.length === 0) {
    return null
  }

  let activeGroup = groups[0]

  for (const group of groups) {
    if (topVisibleIndex >= group.startIndex) {
      activeGroup = group
      continue
    }

    break
  }

  return activeGroup.key
}

function formatTimelineDateKey(value: string): string {
  const date = new Date(value)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatMiniTimelineLabel(value: string): string {
  const date = new Date(value)

  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatMiniTimelineTitle(value: string, count: number): string {
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))

  return `${dateLabel} · ${count} 个块`
}
