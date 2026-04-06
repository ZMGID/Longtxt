import { describe, expect, it, vi } from 'vitest'

import { loadDocumentReferences } from './documentReferences'

describe('loadDocumentReferences', () => {
  it('keeps successfully loaded blocks when part of the batch fails', async () => {
    const loadBlock = vi.fn(async (blockId: string) => {
      if (blockId === 'block-2') {
        throw new Error('not found')
      }

      return {
        id: blockId,
        content: `content-${blockId}`,
        summary: null,
        tags: [],
        createdAt: '2026-04-06T00:00:00.000Z',
        updatedAt: '2026-04-06T00:00:00.000Z',
        status: 'ready' as const,
        aiMode: 'mock' as const,
        errorMessage: null,
      }
    })

    const results = await loadDocumentReferences(loadBlock, ['block-1', 'block-2', 'block-3'])

    expect(results.map((result) => result.block.id)).toEqual(['block-1', 'block-3'])
    expect(results.every((result) => result.score === 0)).toBe(true)
    expect(results.every((result) => result.matchSource.length === 0)).toBe(true)
  })
})
