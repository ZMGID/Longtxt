// @vitest-environment node

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchVectorMatches = vi.fn()
const countBlockVectors = vi.fn()
const getBlocksByIds = vi.fn()

vi.mock('../db/vectors', () => ({
  countBlockVectors: (...args: unknown[]) => countBlockVectors(...args),
  searchVectorMatches: (...args: unknown[]) => searchVectorMatches(...args),
}))

vi.mock('../db/blocks', () => ({
  getBlocksByIds: (...args: unknown[]) => getBlocksByIds(...args),
}))

import { searchBlocks } from '../db/search'

function makeDb(tagMatches: Array<{ id: string; kind: string }> = [], ftsMatches: string[] = []): Database.Database {
  return {
    prepare(sql: string) {
      if (sql.includes('INNER JOIN block_tags')) {
        return {
          all: () => tagMatches,
        }
      }

      if (sql.includes('FROM blocks_fts')) {
        return {
          all: () => ftsMatches.map((id) => ({ id })),
        }
      }

      throw new Error(`Unexpected query in test double: ${sql}`)
    },
  } as unknown as Database.Database
}

describe('search block vector narrowing', () => {
  beforeEach(() => {
    searchVectorMatches.mockReset()
    countBlockVectors.mockReset()
    getBlocksByIds.mockReset()
  })

  it('caps vector candidate scans for large allowed block sets', () => {
    const db = makeDb()
    const allowedBlockIds = Array.from({ length: 500 }, (_, index) => `allowed-${index}`)

    countBlockVectors.mockReturnValue(5_000)
    searchVectorMatches.mockReturnValue([
      { id: 'blocked-1', distance: 0.1 },
      { id: 'allowed-1', distance: 0.2 },
    ])
    getBlocksByIds.mockReturnValue([
      {
        id: 'allowed-1',
        content: '候选块',
        summary: null,
        tags: [],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        status: 'ready',
        aiMode: 'live',
        errorMessage: null,
      },
    ])

    const results = searchBlocks(db, 'semantic query', {
      limit: 10,
      queryEmbedding: [0.1, 0.2, 0.3, 0.4],
      vectorEnabled: true,
      allowedBlockIds,
    })

    expect(searchVectorMatches).toHaveBeenCalledWith(db, [0.1, 0.2, 0.3, 0.4], 50)
    expect(results).toHaveLength(1)
    expect(results[0].block.id).toBe('allowed-1')
    expect(results[0].matchSource).toEqual(['vector'])
  })

  it('skips vector scans when the allowed block set is already small', () => {
    const db = makeDb([], ['allowed-1'])

    getBlocksByIds.mockReturnValue([
      {
        id: 'allowed-1',
        content: 'Electron 检索',
        summary: null,
        tags: [],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        status: 'ready',
        aiMode: 'live',
        errorMessage: null,
      },
    ])

    const results = searchBlocks(db, 'Electron', {
      limit: 10,
      queryEmbedding: [0.5, 0.6, 0.7, 0.8],
      vectorEnabled: true,
      allowedBlockIds: ['allowed-1', 'allowed-2'],
    })

    expect(searchVectorMatches).not.toHaveBeenCalled()
    expect(countBlockVectors).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].matchSource).toContain('fts')
  })
})
