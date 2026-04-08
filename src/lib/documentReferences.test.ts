import { describe, expect, it, vi } from 'vitest'

import { loadDocumentReferences } from './documentReferences'

describe('loadDocumentReferences', () => {
  it('keeps the original order and skips missing blocks in a batch response', async () => {
    const loadBlocks = vi.fn(async (blockIds: string[]) => blockIds
      .filter((blockId) => blockId !== 'block-2')
      .reverse()
      .map((blockId) => ({
        id: blockId,
        content: `content-${blockId}`,
        summary: null,
        tags: [],
        createdAt: '2026-04-06T00:00:00.000Z',
        updatedAt: '2026-04-06T00:00:00.000Z',
        status: 'ready' as const,
        aiMode: 'mock' as const,
        errorMessage: null,
      })))

    const results = await loadDocumentReferences(loadBlocks, ['block-1', 'block-2', 'block-3'])

    expect(results.map((result) => result.block.id)).toEqual(['block-1', 'block-3'])
    expect(results.every((result) => result.score === 0)).toBe(true)
    expect(results.every((result) => result.matchSource.length === 0)).toBe(true)
    expect(loadBlocks).toHaveBeenCalledWith(['block-1', 'block-2', 'block-3'])
  })
})
