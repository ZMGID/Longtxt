import { useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { expandBlockChangedEvents } from '../../shared/eventBatch'
import { applyBlockChangedEventsToCache, applyBlockChangedEventsToFlatBlockList, updateBlockListCache, updateFlatBlockListCache } from '../lib/blockListCache'
import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

const DEBOUNCE_INVALIDATION_MS = 500

export function ChangbuEventBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let tagGraphTimer: ReturnType<typeof setTimeout> | null = null
    let timelineDerivedTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleTagGraphInvalidation = () => {
      if (tagGraphTimer) {
        clearTimeout(tagGraphTimer)
      }

      tagGraphTimer = setTimeout(() => {
        tagGraphTimer = null
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.tags(), exact: true }),
          queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.dataManagement(), exact: true }),
        ])
      }, DEBOUNCE_INVALIDATION_MS)
    }

    const scheduleTimelineDerivedInvalidation = () => {
      if (timelineDerivedTimer) {
        clearTimeout(timelineDerivedTimer)
      }

      timelineDerivedTimer = setTimeout(() => {
        timelineDerivedTimer = null
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.reviewRoot() }),
        ])
      }, DEBOUNCE_INVALIDATION_MS)
    }

    const unsubscribeBatch = changbu.events.onBatch((batch) => {
      const blockEvents = expandBlockChangedEvents(batch)

      if (blockEvents.length > 0) {
        updateBlockListCache(queryClient, (current) => applyBlockChangedEventsToCache(current, blockEvents))
        updateFlatBlockListCache(queryClient, (current) => applyBlockChangedEventsToFlatBlockList(current, blockEvents))
        scheduleTagGraphInvalidation()

        if (blockEvents.some((event) => event.reason === 'created' || event.reason === 'updated' || event.reason === 'deleted')) {
          scheduleTimelineDerivedInvalidation()
        }
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
      if (tagGraphTimer) {
        clearTimeout(tagGraphTimer)
      }

      if (timelineDerivedTimer) {
        clearTimeout(timelineDerivedTimer)
      }

      unsubscribeBatch()
      unsubscribeQuitStateChanged()
    }
  }, [queryClient])

  return null
}
