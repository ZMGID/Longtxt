import type { Block, SearchResult } from '../../shared/types'
import { buildSearchPreview } from '../../shared/searchPreview'
import { getCurrentLanguage } from '../i18n/locale'

export async function runSearchAction(
  action: () => Promise<SearchResult[]>,
  handlers: {
    onStart: () => void
    onSuccess: (results: SearchResult[]) => void
    onError: (message: string) => void
    onFinally?: () => void
  },
): Promise<void> {
  handlers.onStart()

  try {
    handlers.onSuccess(await action())
  } catch (reason) {
    handlers.onError(reason instanceof Error ? reason.message : (getCurrentLanguage() === 'en' ? 'Search failed.' : '搜索失败。'))
  } finally {
    handlers.onFinally?.()
  }
}

export function applyBlockChangeToSearchResults(
  results: SearchResult[],
  event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' },
  query: string,
): SearchResult[] {
  if (!results.some((item) => item.block.id === event.block.id)) {
    return results
  }

  if (event.reason === 'deleted') {
    return results.filter((item) => item.block.id !== event.block.id)
  }

  return results.map((item) => (
    item.block.id === event.block.id
      ? {
          ...item,
          block: event.block,
          preview: buildSearchPreview(event.block.content, query),
        }
      : item
  ))
}

export function applyBlockChangesToSearchResults(
  results: SearchResult[],
  events: Array<{ block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }>,
  query: string,
): SearchResult[] {
  return events.reduce((current, event) => applyBlockChangeToSearchResults(current, event, query), results)
}
