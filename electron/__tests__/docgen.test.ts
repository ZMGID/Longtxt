// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { SearchResult } from '../../shared/types'
import { selectDocumentReferenceBlocks } from '../services/docgen'

function makeResult(
  id: string,
  score: number,
  matchSource: SearchResult['matchSource'],
): SearchResult {
  return {
    block: {
      id,
      content: `块 ${id}`,
      tags: [],
      createdAt: '2026-03-31T09:00:00.000Z',
      updatedAt: '2026-03-31T10:00:00.000Z',
      status: 'ready',
      aiMode: 'mock',
      summary: null,
      errorMessage: null,
    },
    score,
    matchSource,
  }
}

describe('selectDocumentReferenceBlocks', () => {
  it('prioritizes strong matches and supplements with weak matches up to the limit', () => {
    const selected = selectDocumentReferenceBlocks(
      [
        makeResult('strong-1', 0.0162, ['fts']),
        makeResult('weak-1', 0.0124, ['fts']),
        makeResult('strong-2', 0.0112, ['fts', 'vector']),
        makeResult('weak-2', 0.0103, ['tag']),
      ],
      3,
    )

    expect(selected.map((block) => block.id)).toEqual(['strong-1', 'strong-2'])
  })

  it('drops low-score matches even when there is still room left', () => {
    const selected = selectDocumentReferenceBlocks(
      [
        makeResult('strong-1', 0.0162, ['fts']),
        makeResult('too-weak', 0.0098, ['vector']),
      ],
      5,
    )

    expect(selected.map((block) => block.id)).toEqual(['strong-1'])
  })

  it('does not treat low-ranked single-source results as weak supplements', () => {
    const selected = selectDocumentReferenceBlocks(
      [
        makeResult('strong-1', 0.0162, ['fts']),
        makeResult('rank-11-ish', 0.0141, ['fts']),
      ],
      5,
    )

    expect(selected.map((block) => block.id)).toEqual(['strong-1'])
  })

  it('respects the configured maximum number of references', () => {
    const selected = selectDocumentReferenceBlocks(
      [
        makeResult('strong-1', 0.0163, ['fts']),
        makeResult('strong-2', 0.0161, ['tag']),
        makeResult('strong-3', 0.0159, ['vector']),
      ],
      2,
    )

    expect(selected.map((block) => block.id)).toEqual(['strong-1', 'strong-2'])
  })
})
