import { useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

export function ChangbuEventBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribeBlockChanged = changbu.events.onBlockChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.blocks() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
    })
    const unsubscribeNotebooksChanged = changbu.events.onNotebooksChanged((event) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notebooks() })

      if (event.notebookIds.length === 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notebookRoot() })
        return
      }

      for (const notebookId of event.notebookIds) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notebook(notebookId) })
      }
    })
    const unsubscribeMetaChanged = changbu.events.onMetaChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meta() })
    })
    const unsubscribeCalendarChanged = changbu.events.onCalendarChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() })
    })

    return () => {
      unsubscribeBlockChanged()
      unsubscribeNotebooksChanged()
      unsubscribeMetaChanged()
      unsubscribeCalendarChanged()
    }
  }, [queryClient])

  return null
}
