import { useMemo } from 'react'

import { useQueries } from '@tanstack/react-query'

import type { CalendarDayDetail } from '../../shared/types'
import { translateMessage } from '../i18n/messages'
import { getCurrentLanguage } from '../i18n/locale'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { buildTimelineReviewDateRange } from '../lib/timelineReview'

export function useTimelineReviewWindow(anchorDateKey: string) {
  const dates = useMemo(() => buildTimelineReviewDateRange(anchorDateKey), [anchorDateKey])
  const queries = useQueries({
    queries: dates.map((date) => ({
      queryKey: queryKeys.calendarDay(date),
      queryFn: () => changbu.calendar.getDayDetail(date),
      enabled: Boolean(date),
    })),
  })

  return useMemo(() => {
    const loading = queries.some((query) => query.isPending)
    const errorQuery = queries.find((query) => query.isError)
    const details = queries
      .map((query) => query.data)
      .filter((detail): detail is CalendarDayDetail => Boolean(detail))

    return {
      loading,
      error: errorQuery?.error instanceof Error
        ? errorQuery.error.message
        : errorQuery?.error
          ? translateMessage('timelineReviewWindow.loadFailed', getCurrentLanguage())
          : null,
      blocks: details.flatMap((detail) => detail.blocks),
      entries: details.flatMap((detail) => detail.entries),
    }
  }, [queries])
}
