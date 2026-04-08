import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import {
  buildTimelineDateCountMap,
  buildTimelineHeatmapColumns,
  buildTimelineMonthGrid,
  formatTimelineMonthTitle,
  shiftTimelineMonth,
} from './timelineSidebar'

const sampleBlocks: Block[] = [
  {
    id: 'block-1',
    content: '第一条',
    tags: [],
    createdAt: '2026-04-15T09:00:00.000Z',
    updatedAt: '2026-04-15T09:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-2',
    content: '第二条',
    tags: [],
    createdAt: '2026-04-15T12:00:00.000Z',
    updatedAt: '2026-04-15T12:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
  {
    id: 'block-3',
    content: '第三条',
    tags: [],
    createdAt: '2026-04-03T08:00:00.000Z',
    updatedAt: '2026-04-03T08:00:00.000Z',
    status: 'ready',
    aiMode: 'live',
  },
]

describe('timelineSidebar utils', () => {
  it('builds date counts from blocks', () => {
    const counts = buildTimelineDateCountMap(sampleBlocks)

    expect(counts.get('2026-04-15')).toBe(2)
    expect(counts.get('2026-04-03')).toBe(1)
  })

  it('builds a full month grid with selection state', () => {
    const counts = buildTimelineDateCountMap(sampleBlocks)
    const rows = buildTimelineMonthGrid('2026-04-01', '2026-04-15', counts, '2026-04-15')

    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveLength(7)
    expect(rows[0][0]?.dateKey).toBe('2026-03-30')
    expect(rows.at(-1)?.at(-1)?.dateKey).toBe('2026-05-03')

    const selectedCell = rows.flat().find((cell) => cell.dateKey === '2026-04-15')
    expect(selectedCell).toMatchObject({
      isSelected: true,
      isToday: true,
      count: 2,
    })
  })

  it('builds compact heatmap columns around the anchor date', () => {
    const counts = buildTimelineDateCountMap(sampleBlocks)
    const columns = buildTimelineHeatmapColumns(counts, '2026-04-10', 14)
    const days = columns.flatMap((column) => column.days).filter((day) => day !== null)

    expect(days).toHaveLength(14)
    expect(days[0]?.date).toBe('2026-04-04')

    const activeDay = days.find((day) => day?.date === '2026-04-15')
    expect(activeDay).toMatchObject({
      blockCount: 2,
      hasEntries: true,
    })
    expect(activeDay?.intensityLevel).toBeGreaterThan(0)
  })

  it('formats month titles and shifts months', () => {
    expect(formatTimelineMonthTitle('2026-04-01')).toBe('4月 2026')
    expect(shiftTimelineMonth('2026-04-01', -1)).toBe('2026-03-01')
    expect(shiftTimelineMonth('2026-04-01', 1)).toBe('2026-05-01')
  })
})
