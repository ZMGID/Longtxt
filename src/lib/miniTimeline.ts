import type { Block } from '../../shared/types'
import { formatDateByLanguage, getCurrentLanguage, type AppLanguage } from '../i18n/locale'

export interface MiniTimelineGroup {
  key: string
  label: string
  title: string
  startIndex: number
  count: number
  positionRatio: number
}

export function buildMiniTimelineGroups(blocks: Block[], language: AppLanguage = getCurrentLanguage()): MiniTimelineGroup[] {
  if (blocks.length === 0) {
    return []
  }

  const groups: Array<Omit<MiniTimelineGroup, 'positionRatio'>> = []

  blocks.forEach((block, index) => {
    const key = formatTimelineDateKey(block.createdAt)
    const previousGroup = groups.at(-1)

    if (previousGroup?.key === key) {
      previousGroup.count += 1
      previousGroup.title = formatMiniTimelineTitle(block.createdAt, previousGroup.count, language)
      return
    }

    groups.push({
      key,
      label: formatMiniTimelineLabel(block.createdAt),
      title: formatMiniTimelineTitle(block.createdAt, 1, language),
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

function formatMiniTimelineTitle(value: string, count: number, language: AppLanguage): string {
  const dateLabel = formatDateByLanguage(new Date(value), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }, language)

  return language === 'en'
    ? `${dateLabel} · ${count} blocks`
    : `${dateLabel} · ${count} 个块`
}
