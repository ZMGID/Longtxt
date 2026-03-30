import { useEffect, useState } from 'react'

import type { TagSuggestion } from '../../shared/types'
import { changbu } from '../lib/changbu'

export function useTags() {
  const [tags, setTags] = useState<TagSuggestion[]>([])

  useEffect(() => {
    let active = true

    const loadTags = async () => {
      const nextTags = await changbu.tags.list()

      if (active) {
        setTags(nextTags)
      }
    }

    void loadTags()

    const unsubscribe = changbu.events.onBlockChanged(() => {
      void loadTags()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return {
    tags,
    refresh: async () => {
      const nextTags = await changbu.tags.list()
      setTags(nextTags)
    },
  }
}
