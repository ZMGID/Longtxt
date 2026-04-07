import { useQuery } from '@tanstack/react-query'

import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

export interface BlockCleanupDaySummary {
  date: string
  blockCount: number
}

export async function fetchBlockCleanupDays(): Promise<BlockCleanupDaySummary[]> {
  const years = await changbu.calendar.listYears()

  if (years.length === 0) {
    return []
  }

  const heatmaps = await Promise.all(years.map((year) => changbu.calendar.getYearHeatmap(year)))

  return heatmaps
    .flatMap((heatmap) =>
      heatmap.days.map((day) => ({
        date: day.date,
        blockCount: day.blockCount,
      })),
    )
    .filter((day) => day.blockCount > 0)
    .sort((left, right) => right.date.localeCompare(left.date))
}

export function useBlockCleanupDays(enabled = true) {
  return useQuery({
    queryKey: queryKeys.blockCleanupDays(),
    enabled,
    queryFn: fetchBlockCleanupDays,
  })
}
