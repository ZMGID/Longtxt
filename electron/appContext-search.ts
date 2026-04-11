/**
 * 搜索与图谱缓存管理
 *
 * 提供搜索结果缓存、图谱缓存、缓存失效策略，
 * 以及 searchBlocks / searchByTag / getGraphData 公共方法。
 */

import type {
  AIExecutionMode,
  Block,
  SearchResult,
} from '../shared/types'
import { getIntlLocale } from '../shared/config'
import { buildSearchPreview } from '../shared/searchPreview'
import { searchBlocks as searchBlocksInDatabase, searchBlocksByTag } from './db/search'
import { getGraphData as loadGraphData } from './db/graph'

/** 搜索缓存容量上限 */
const SEARCH_CACHE_LIMIT = 32
/** 搜索缓存 TTL（毫秒） */
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
/** 图谱缓存容量上限 */
const GRAPH_CACHE_LIMIT = 12

interface SearchCacheEntry {
  results: SearchResult[]
  updatedAt: number
  dirty: boolean
}

interface GraphCacheEntry {
  data: { nodes: Awaited<ReturnType<typeof loadGraphData>>['nodes']; edges: Awaited<ReturnType<typeof loadGraphData>>['edges'] }
  dirty: boolean
}

interface InFlightRequest {
  epoch: number
  request: Promise<SearchResult[]>
}

export interface SearchDeps {
  db: import('better-sqlite3').Database
  getProviders: () => { mode: AIExecutionMode; embeddingProvider: import('./services/ai').EmbeddingProvider | null; llmProvider: import('./services/ai').LLMProvider | null }
  canUseVectorSearch: () => boolean
  getQueryEmbedding: (query: string, mode: AIExecutionMode, provider: import('./services/ai').EmbeddingProvider | null) => Promise<number[] | null>
  getCurrentVectorIndexState: () => import('./appContext-types').VectorIndexState | null
  validateContent: (content: string) => string
  getUiSettings: () => { language: import('../shared/types').AppLanguage }
  emitBlockChanged: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
}

export interface SearchModule {
  setSearchCacheEntry: (cacheKey: string, results: SearchResult[], dirty?: boolean, expectedEpoch?: number | null) => SearchResult[]
  getSearchCacheEntry: (cacheKey: string) => SearchResult[] | null
  createSearchResultPreview: (block: Block, query: string) => string
  markSearchCachesDirty: (event?: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  markGraphCachesDirty: () => void
  emitBlockChangedWithDerivedInvalidation: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  getGraphData: (tagNames?: string[]) => Promise<{ nodes: Awaited<ReturnType<typeof loadGraphData>>['nodes']; edges: Awaited<ReturnType<typeof loadGraphData>>['edges'] }>
  searchBlocks: (query: string, limit?: number) => Promise<SearchResult[]>
  searchByTag: (tagName: string, limit?: number) => Promise<SearchResult[]>
}

function pruneLeastRecentlyUsedEntries<T>(cache: Map<string, T>, limit: number): void {
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value

    if (!oldestKey) {
      break
    }

    cache.delete(oldestKey)
  }
}

export function createSearchModule(deps: SearchDeps): SearchModule {
  const { db, getProviders, canUseVectorSearch, getQueryEmbedding, getCurrentVectorIndexState, validateContent, getUiSettings, emitBlockChanged } = deps

  const searchResultCache = new Map<string, SearchCacheEntry>()
  const searchInFlightRequests = new Map<string, InFlightRequest>()
  let searchCacheEpoch = 0
  const graphResultCache = new Map<string, GraphCacheEntry>()

  function setSearchCacheEntry(cacheKey: string, results: SearchResult[], dirty = false, expectedEpoch: number | null = null): SearchResult[] {
    if (expectedEpoch !== null && expectedEpoch !== searchCacheEpoch) {
      return results
    }

    searchResultCache.delete(cacheKey)
    searchResultCache.set(cacheKey, {
      results,
      updatedAt: Date.now(),
      dirty,
    })
    pruneLeastRecentlyUsedEntries(searchResultCache, SEARCH_CACHE_LIMIT)
    return results
  }

  function getSearchCacheEntry(cacheKey: string): SearchResult[] | null {
    const cached = searchResultCache.get(cacheKey)

    if (!cached) {
      return null
    }

    if (cached.dirty || Date.now() - cached.updatedAt > SEARCH_CACHE_TTL_MS) {
      searchResultCache.delete(cacheKey)
      return null
    }

    searchResultCache.delete(cacheKey)
    searchResultCache.set(cacheKey, {
      ...cached,
      updatedAt: Date.now(),
    })

    return cached.results
  }

  function createSearchResultPreview(block: Block, query: string): string {
    return buildSearchPreview(block.content, query)
  }

  function patchSearchResults(results: SearchResult[], event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }, query: string): SearchResult[] {
    const index = results.findIndex((item) => item.block.id === event.block.id)

    if (index === -1) {
      return results
    }

    if (event.reason === 'deleted') {
      return results.filter((item) => item.block.id !== event.block.id)
    }

    const nextResults = results.slice()
    const current = nextResults[index]

    if (!current) {
      return results
    }

    nextResults[index] = {
      ...current,
      block: event.block,
      preview: createSearchResultPreview(event.block, query),
    }

    return nextResults
  }

  function markSearchCachesDirty(event?: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }): void {
    searchCacheEpoch += 1
    searchInFlightRequests.clear()

    if (searchResultCache.size === 0) {
      return
    }

    for (const [cacheKey, entry] of searchResultCache.entries()) {
      let query = ''

      try {
        query = (JSON.parse(cacheKey) as { query?: string }).query ?? ''
      } catch {
        query = ''
      }

      const patchedResults = event ? patchSearchResults(entry.results, event, query) : entry.results

      searchResultCache.set(cacheKey, {
        results: patchedResults,
        updatedAt: entry.updatedAt,
        dirty: true,
      })
    }
  }

  function normalizeGraphTagFilters(tagNames: string[]): string[] {
    const locale = getIntlLocale(getUiSettings().language)

    return Array.from(
      new Set(
        tagNames
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, locale))
  }

  function getGraphCacheKey(tagNames: string[]): string {
    return normalizeGraphTagFilters(tagNames).join('||')
  }

  function getGraphCacheEntry(tagNames: string[]) {
    const cacheKey = getGraphCacheKey(tagNames)
    const cached = graphResultCache.get(cacheKey)

    if (!cached || cached.dirty) {
      if (cached?.dirty) {
        graphResultCache.delete(cacheKey)
      }

      return null
    }

    graphResultCache.delete(cacheKey)
    graphResultCache.set(cacheKey, cached)
    return cached.data
  }

  function setGraphCacheEntry(tagNames: string[], data: Awaited<ReturnType<typeof loadGraphData>>): Awaited<ReturnType<typeof loadGraphData>> {
    const cacheKey = getGraphCacheKey(tagNames)
    graphResultCache.delete(cacheKey)
    graphResultCache.set(cacheKey, {
      data,
      dirty: false,
    })
    pruneLeastRecentlyUsedEntries(graphResultCache, GRAPH_CACHE_LIMIT)
    return data
  }

  function markGraphCachesDirty(): void {
    for (const [cacheKey, entry] of graphResultCache.entries()) {
      graphResultCache.set(cacheKey, {
        ...entry,
        dirty: true,
      })
    }
  }

  function createSearchCacheKey(options: {
    type: 'query' | 'tag'
    query: string
    limit: number
    mode?: AIExecutionMode
    vectorEnabled?: boolean
    vectorIndexState?: string | null
  }): string {
    return JSON.stringify({
      type: options.type,
      query: options.query,
      limit: options.limit,
      mode: options.mode ?? 'static',
      vectorEnabled: Boolean(options.vectorEnabled),
      vectorIndexState: options.vectorIndexState ?? 'none',
    })
  }

  function emitBlockChangedWithDerivedInvalidation(event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }): void {
    markSearchCachesDirty(event)
    markGraphCachesDirty()
    emitBlockChanged(event)
  }

  async function getGraphData(tagNames: string[] = []) {
    const normalizedTags = normalizeGraphTagFilters(tagNames)
    const cached = getGraphCacheEntry(normalizedTags)

    if (cached) {
      return cached
    }

    return setGraphCacheEntry(normalizedTags, loadGraphData(db, normalizedTags))
  }

  async function searchBlocksImpl(query: string, limit = 20) {
    const normalizedQuery = validateContent(query)
    const { mode, embeddingProvider } = getProviders()
    const vectorEnabled = canUseVectorSearch()
    const currentVectorIndexState = getCurrentVectorIndexState()
    const cacheKey = createSearchCacheKey({
      type: 'query',
      query: normalizedQuery,
      limit,
      mode,
      vectorEnabled,
      vectorIndexState: currentVectorIndexState?.configFingerprint ?? currentVectorIndexState?.mode ?? 'none',
    })
    const cached = getSearchCacheEntry(cacheKey)

    if (cached) {
      return cached
    }

    const inFlight = searchInFlightRequests.get(cacheKey)

    if (inFlight?.epoch === searchCacheEpoch) {
      return inFlight.request
    }

    searchInFlightRequests.delete(cacheKey)
    const requestEpoch = searchCacheEpoch
    const request = (async () => {
      const queryEmbedding = await getQueryEmbedding(normalizedQuery, mode, embeddingProvider)

      return setSearchCacheEntry(cacheKey, searchBlocksInDatabase(db, normalizedQuery, {
        limit,
        queryEmbedding,
        vectorEnabled: vectorEnabled && Boolean(queryEmbedding),
      }), false, requestEpoch)
    })()

    searchInFlightRequests.set(cacheKey, {
      epoch: requestEpoch,
      request,
    })

    try {
      return await request
    } finally {
      const active = searchInFlightRequests.get(cacheKey)

      if (active?.request === request) {
        searchInFlightRequests.delete(cacheKey)
      }
    }
  }

  async function searchByTagImpl(tagName: string, limit = 50) {
    const normalizedTagName = tagName.trim()

    if (!normalizedTagName) {
      return []
    }

    const cacheKey = createSearchCacheKey({
      type: 'tag',
      query: normalizedTagName,
      limit,
    })
    const cached = getSearchCacheEntry(cacheKey)

    if (cached) {
      return cached
    }

    const inFlight = searchInFlightRequests.get(cacheKey)

    if (inFlight?.epoch === searchCacheEpoch) {
      return inFlight.request
    }

    searchInFlightRequests.delete(cacheKey)
    const requestEpoch = searchCacheEpoch
    const request = Promise.resolve(setSearchCacheEntry(cacheKey, searchBlocksByTag(db, normalizedTagName, limit), false, requestEpoch))

    searchInFlightRequests.set(cacheKey, {
      epoch: requestEpoch,
      request,
    })

    try {
      return await request
    } finally {
      const active = searchInFlightRequests.get(cacheKey)

      if (active?.request === request) {
        searchInFlightRequests.delete(cacheKey)
      }
    }
  }

  return {
    setSearchCacheEntry,
    getSearchCacheEntry,
    createSearchResultPreview,
    markSearchCachesDirty,
    markGraphCachesDirty,
    emitBlockChangedWithDerivedInvalidation,
    getGraphData,
    searchBlocks: searchBlocksImpl,
    searchByTag: searchByTagImpl,
  }
}
