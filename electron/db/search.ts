import Database from 'better-sqlite3'

import type { SearchResult } from '../../shared/types'
import { getBlocksByIds } from './blocks'
import { countBlockVectors, searchVectorMatches } from './vectors'

const TAG_KIND_WEIGHT: Record<string, number> = {
  category: 0.35,
  detail: 1,
  user: 1,
}

interface SearchBlocksOptions {
  limit?: number
  queryEmbedding?: number[] | null
  vectorEnabled?: boolean
  allowedBlockIds?: string[]
}

function reciprocalRank(rank: number): number {
  return 1 / (60 + rank)
}

function buildAllowedIdsClause(ids: string[] | undefined, columnName: string): { sql: string; params: string[] } {
  if (!ids || ids.length === 0) {
    return { sql: '', params: [] }
  }

  return {
    sql: ` AND ${columnName} IN (${ids.map(() => '?').join(', ')})`,
    params: ids,
  }
}

function searchByTag(
  db: Database.Database,
  query: string,
  limit: number,
  allowedBlockIds?: string[],
): Array<{ id: string; kind: string }> {
  const allowed = buildAllowedIdsClause(allowedBlockIds, 'b.id')

  return db
    .prepare(
      `
        SELECT b.id, t.kind
        FROM blocks b
        INNER JOIN block_tags bt ON bt.block_id = b.id
        INNER JOIN tags t ON t.id = bt.tag_id
        WHERE t.name LIKE ?
        ${allowed.sql}
        ORDER BY
          CASE t.kind
            WHEN 'detail' THEN 0
            WHEN 'user' THEN 1
            ELSE 2
          END,
          b.updated_at DESC
        LIMIT ?
      `,
    )
    .all(`%${query}%`, ...allowed.params, limit) as Array<{ id: string; kind: string }>
}

function browseByExactTag(db: Database.Database, tagName: string, limit: number): string[] {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT b.id
        FROM blocks b
        INNER JOIN block_tags bt ON bt.block_id = b.id
        INNER JOIN tags t ON t.id = bt.tag_id
        WHERE lower(t.name) = lower(?)
        ORDER BY b.updated_at DESC
        LIMIT ?
      `,
    )
    .all(tagName, limit) as Array<{ id: string }>

  return rows.map((row) => row.id)
}

function searchByFts(db: Database.Database, query: string, limit: number, allowedBlockIds?: string[]): string[] {
  const allowed = buildAllowedIdsClause(allowedBlockIds, 'b.id')

  try {
    const rows = db
      .prepare(
        `
          SELECT b.id
          FROM blocks_fts fts
          INNER JOIN blocks b ON b.rowid = fts.rowid
          WHERE blocks_fts MATCH ?
          ${allowed.sql}
          ORDER BY rank
          LIMIT ?
        `,
      )
      .all(query, ...allowed.params, limit) as Array<{ id: string }>

    return rows.map((row) => row.id)
  } catch {
    const fallbackAllowed = buildAllowedIdsClause(allowedBlockIds, 'id')
    const fallbackRows = db
      .prepare(
        `
          SELECT id
          FROM blocks
          WHERE content LIKE ?
          ${fallbackAllowed.sql}
          ORDER BY updated_at DESC
          LIMIT ?
        `,
      )
      .all(`%${query}%`, ...fallbackAllowed.params, limit) as Array<{ id: string }>

    return fallbackRows.map((row) => row.id)
  }
}

export function searchBlocks(db: Database.Database, query: string, options: SearchBlocksOptions = {}): SearchResult[] {
  const normalizedQuery = query.trim()
  const limit = options.limit ?? 20
  const allowedBlockIds = options.allowedBlockIds?.filter(Boolean)

  if (!normalizedQuery) {
    return []
  }

  if (allowedBlockIds && allowedBlockIds.length === 0) {
    return []
  }

  const tagMatches = searchByTag(db, normalizedQuery, limit, allowedBlockIds)
  const ftsMatches = searchByFts(db, normalizedQuery, limit, allowedBlockIds)
  const vectorMatches = (() => {
    if (!options.vectorEnabled || !options.queryEmbedding) {
      return []
    }

    const rawMatches = searchVectorMatches(
      db,
      options.queryEmbedding,
      allowedBlockIds ? Math.max(countBlockVectors(db), limit) : limit,
    )

    if (!allowedBlockIds) {
      return rawMatches
    }

    const allowedSet = new Set(allowedBlockIds)
    return rawMatches.filter((match) => allowedSet.has(match.id)).slice(0, limit)
  })()

  const ranking = new Map<string, { score: number; matchSource: Set<'tag' | 'fts' | 'vector'> }>()

  for (const [index, match] of tagMatches.entries()) {
    const current = ranking.get(match.id) ?? { score: 0, matchSource: new Set<'tag' | 'fts' | 'vector'>() }
    current.score += reciprocalRank(index + 1) * (TAG_KIND_WEIGHT[match.kind] ?? 0.35)
    current.matchSource.add('tag')
    ranking.set(match.id, current)
  }

  for (const [index, id] of ftsMatches.entries()) {
    const current = ranking.get(id) ?? { score: 0, matchSource: new Set<'tag' | 'fts' | 'vector'>() }
    current.score += reciprocalRank(index + 1)
    current.matchSource.add('fts')
    ranking.set(id, current)
  }

  for (const [index, match] of vectorMatches.entries()) {
    const current = ranking.get(match.id) ?? { score: 0, matchSource: new Set<'tag' | 'fts' | 'vector'>() }
    current.score += reciprocalRank(index + 1)
    current.matchSource.add('vector')
    ranking.set(match.id, current)
  }

  const sortedIds = Array.from(ranking.entries())
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, limit)
    .map(([id]) => id)

  const blocks = getBlocksByIds(db, sortedIds)
  const blockMap = new Map(blocks.map((block) => [block.id, block]))

  return sortedIds
    .map((id) => {
      const ranked = ranking.get(id)
      const block = blockMap.get(id)

      if (!ranked || !block) {
        return null
      }

      return {
        block,
        score: Number(ranked.score.toFixed(4)),
        matchSource: Array.from(ranked.matchSource),
      }
    })
    .filter((item): item is SearchResult => Boolean(item))
}

export function searchBlocksByTag(db: Database.Database, tagName: string, limit = 50): SearchResult[] {
  const normalizedTagName = tagName.trim()

  if (!normalizedTagName) {
    return []
  }

  const ids = browseByExactTag(db, normalizedTagName, limit)
  const blocks = getBlocksByIds(db, ids)
  const blockMap = new Map(blocks.map((block) => [block.id, block]))

  return ids
    .map((id, index) => {
      const block = blockMap.get(id)

      if (!block) {
        return null
      }

      return {
        block,
        score: Number(reciprocalRank(index + 1).toFixed(4)),
        matchSource: ['tag'],
      }
    })
    .filter((item): item is SearchResult => item !== null)
}
