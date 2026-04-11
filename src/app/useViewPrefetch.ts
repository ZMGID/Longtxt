import { useCallback, useEffect, useRef } from 'react'

import type { QueryClient } from '@tanstack/react-query'

import type { AppView } from '../components/AppSidebar'
import { changbu } from '../lib/changbu'
import { fetchBlockCleanupDays } from '../hooks/useBlockCleanupDays'
import { queryKeys } from '../lib/queryKeys'
import { STARTUP_PREFETCH_PLAN, VIEW_MODULE_PRELOADERS } from './viewRegistry'

function formatTodayDateKey(): string {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

export function useViewPrefetch({
  loading,
  calendarUpcomingDays,
  graphTagFilters,
  queryClient,
}: {
  loading: boolean
  calendarUpcomingDays: number
  graphTagFilters: string[]
  queryClient: QueryClient
}) {
  const prefetchedViewsRef = useRef<Set<AppView>>(new Set(['timeline']))
  const scheduledPrefetchesRef = useRef<Partial<Record<AppView, ReturnType<typeof setTimeout>>>>({})

  const clearScheduledPrefetch = useCallback((view?: AppView): void => {
    if (view) {
      const timer = scheduledPrefetchesRef.current[view]

      if (timer) {
        clearTimeout(timer)
        delete scheduledPrefetchesRef.current[view]
      }

      return
    }

    for (const scheduledView of Object.keys(scheduledPrefetchesRef.current) as AppView[]) {
      const timer = scheduledPrefetchesRef.current[scheduledView]

      if (timer) {
        clearTimeout(timer)
      }
    }

    scheduledPrefetchesRef.current = {}
  }, [])

  const prefetchQueryIfNeeded = useCallback(
    async <T,>(options: {
      queryKey: readonly unknown[]
      queryFn: () => Promise<T>
    }): Promise<void> => {
      const queryState = queryClient.getQueryState(options.queryKey)

      if (queryState?.fetchStatus === 'fetching' || queryState?.status === 'success') {
        return
      }

      await queryClient.prefetchQuery(options)
    },
    [queryClient],
  )

  const runPrefetchViewResources = useCallback((view: AppView): void => {
    const currentYear = new Date().getFullYear()
    const today = formatTodayDateKey()
    prefetchedViewsRef.current.add(view)
    void VIEW_MODULE_PRELOADERS[view]?.()

    switch (view) {
      case 'calendar':
        void Promise.allSettled([
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarYears(),
            queryFn: () => changbu.calendar.listYears(),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarHeatmap(currentYear),
            queryFn: () => changbu.calendar.getYearHeatmap(currentYear),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarDay(today),
            queryFn: () => changbu.calendar.getDayDetail(today),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.calendarUpcoming(calendarUpcomingDays),
            queryFn: () => changbu.calendar.listUpcoming(calendarUpcomingDays),
          }),
        ])
        return
      case 'graph':
        void prefetchQueryIfNeeded({
          queryKey: queryKeys.graph(graphTagFilters),
          queryFn: () => changbu.graph.getData(graphTagFilters),
        })
        return
      case 'snapshots':
        void prefetchQueryIfNeeded({
          queryKey: queryKeys.snapshots('', null),
          queryFn: () => changbu.snapshots.list('', null),
        })
        return
      case 'data-management':
        void Promise.allSettled([
          prefetchQueryIfNeeded({
            queryKey: queryKeys.dataManagement(),
            queryFn: () => changbu.data.getOverview(),
          }),
          prefetchQueryIfNeeded({
            queryKey: queryKeys.blockCleanupDays(),
            queryFn: fetchBlockCleanupDays,
          }),
        ])
        return
      case 'search':
      case 'notebooks':
      case 'timeline':
        return
    }
  }, [calendarUpcomingDays, graphTagFilters, prefetchQueryIfNeeded])

  const prefetchViewResources = useCallback((view: AppView): void => {
    clearScheduledPrefetch(view)
    runPrefetchViewResources(view)
  }, [clearScheduledPrefetch, runPrefetchViewResources])

  useEffect(() => {
    if (loading) {
      return
    }

    for (const { view, delayMs } of STARTUP_PREFETCH_PLAN) {
      if (prefetchedViewsRef.current.has(view) || scheduledPrefetchesRef.current[view]) {
        continue
      }

      scheduledPrefetchesRef.current[view] = setTimeout(() => {
        delete scheduledPrefetchesRef.current[view]
        runPrefetchViewResources(view)
      }, delayMs)
    }

    return () => {
      clearScheduledPrefetch()
    }
  }, [clearScheduledPrefetch, loading, runPrefetchViewResources])

  return {
    prefetchViewResources,
  }
}
