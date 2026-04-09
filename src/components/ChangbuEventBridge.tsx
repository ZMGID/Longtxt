import { useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { expandBlockChangedEvents } from '../../shared/eventBatch'
import {
  applyBlockChangedEventsToCache,
  applyBlockChangedEventsToFlatBlockList,
  coalesceBlockChangedEvents,
  updateBlockListCache,
  updateFlatBlockListCache,
} from '../lib/blockListCache'
import {
  collectReviewQueryKeysToInvalidate,
  getBlockEventInvalidationImpact,
  updateBlocksByDateCaches,
  updateCalendarDayCaches,
} from '../lib/blockEventQueryRouting'
import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

const DEBOUNCE_INVALIDATION_MS = 500

export function ChangbuEventBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let blockInvalidationTimer: ReturnType<typeof setTimeout> | null = null
    let pendingTagsInvalidation = false
    let pendingGraphInvalidation = false
    let pendingDataManagementInvalidation = false
    let pendingBlockCleanupDaysInvalidation = false
    let pendingCalendarYearsInvalidation = false
    const pendingCalendarHeatmapYears = new Set<number>()
    const pendingReviewDates = new Set<string>()

    const flushBlockInvalidations = () => {
      blockInvalidationTimer = null

      const invalidateTasks: Array<Promise<unknown>> = []

      if (pendingTagsInvalidation) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.tags(), exact: true }))
      }

      if (pendingGraphInvalidation) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot() }))
      }

      if (pendingDataManagementInvalidation) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement(), exact: true }))
      }

      if (pendingBlockCleanupDaysInvalidation) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.blockCleanupDays(), exact: true }))
      }

      if (pendingCalendarYearsInvalidation) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.calendarYears(), exact: true }))
      }

      for (const year of pendingCalendarHeatmapYears) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.calendarHeatmap(year), exact: true }))
      }

      const reviewQueryKeys = collectReviewQueryKeysToInvalidate(queryClient, Array.from(pendingReviewDates))

      for (const queryKey of reviewQueryKeys) {
        invalidateTasks.push(queryClient.invalidateQueries({ queryKey, exact: true }))
      }

      pendingTagsInvalidation = false
      pendingGraphInvalidation = false
      pendingDataManagementInvalidation = false
      pendingBlockCleanupDaysInvalidation = false
      pendingCalendarYearsInvalidation = false
      pendingCalendarHeatmapYears.clear()
      pendingReviewDates.clear()

      if (invalidateTasks.length > 0) {
        void Promise.all(invalidateTasks)
      }
    }

    const scheduleBlockInvalidations = (impact: ReturnType<typeof getBlockEventInvalidationImpact>) => {
      pendingTagsInvalidation = pendingTagsInvalidation || impact.invalidateTags
      pendingGraphInvalidation = pendingGraphInvalidation || impact.invalidateGraph
      pendingDataManagementInvalidation = pendingDataManagementInvalidation || impact.invalidateDataManagement
      pendingBlockCleanupDaysInvalidation = pendingBlockCleanupDaysInvalidation || impact.invalidateBlockCleanupDays
      pendingCalendarYearsInvalidation = pendingCalendarYearsInvalidation || impact.invalidateCalendarYears

      for (const year of impact.heatmapYears) {
        pendingCalendarHeatmapYears.add(year)
      }

      for (const dateKey of impact.reviewDates) {
        pendingReviewDates.add(dateKey)
      }

      if (blockInvalidationTimer) {
        clearTimeout(blockInvalidationTimer)
      }

      blockInvalidationTimer = setTimeout(() => {
        flushBlockInvalidations()
      }, DEBOUNCE_INVALIDATION_MS)
    }

    const unsubscribeBatch = changbu.events.onBatch((batch) => {
      const expandedBlockEvents = expandBlockChangedEvents(batch)
      const blockEvents = coalesceBlockChangedEvents(expandedBlockEvents)

      if (blockEvents.length > 0) {
        updateBlockListCache(queryClient, (current) => applyBlockChangedEventsToCache(current, blockEvents))
        updateFlatBlockListCache(queryClient, (current) => applyBlockChangedEventsToFlatBlockList(current, blockEvents))
        updateBlocksByDateCaches(queryClient, blockEvents)
        updateCalendarDayCaches(queryClient, blockEvents)
        scheduleBlockInvalidations(getBlockEventInvalidationImpact(blockEvents))
      }

      if (batch.notebookChanges.length > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notebooks() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement() })

        const notebookIds = new Set(batch.notebookChanges.flatMap((event) => event.notebookIds))

        if (notebookIds.size === 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.notebookRoot() })
        } else {
          for (const notebookId of notebookIds) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notebook(notebookId) })
          }
        }
      }

      if (batch.metaChanges.length > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.meta() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.reviewRoot() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.settingsRoot() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement() })
      }

      if (batch.calendarChanges.length > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.reviewRoot() })
      }
    })
    const unsubscribeQuitStateChanged = changbu.events.onQuitStateChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meta() })
    })

    return () => {
      if (blockInvalidationTimer) {
        clearTimeout(blockInvalidationTimer)
      }

      pendingCalendarHeatmapYears.clear()
      pendingReviewDates.clear()

      unsubscribeBatch()
      unsubscribeQuitStateChanged()
    }
  }, [queryClient])

  return null
}
