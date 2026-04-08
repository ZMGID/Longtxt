import { describe, expect, it } from 'vitest'

import type { Block } from '../../shared/types'
import { resolveSelectedGraphBlock } from './graphSelection'

const baseBlock: Block = {
  id: 'block-1',
  content: 'block content',
  summary: 'block summary',
  tags: [],
  createdAt: '2026-04-07T00:00:00.000Z',
  updatedAt: '2026-04-07T00:00:00.000Z',
  status: 'ready',
  aiMode: 'live',
  errorMessage: null,
}

describe('resolveSelectedGraphBlock', () => {
  it('returns the loaded block when it already exists in the current dataset', () => {
    const loadedBlock = { ...baseBlock, id: 'block-2', summary: 'loaded block' }
    const staleFallback = { ...baseBlock, id: 'block-1', summary: 'stale fallback' }

    expect(resolveSelectedGraphBlock([loadedBlock], 'block-2', staleFallback)).toBe(loadedBlock)
  })

  it('returns the current fallback while the selected block is still fetching', () => {
    const pendingFallback = { ...baseBlock, id: 'block-3', summary: 'pending fallback' }

    expect(resolveSelectedGraphBlock([], 'block-3', pendingFallback)).toBe(pendingFallback)
  })

  it('drops a stale fallback from the previous selection', () => {
    const staleFallback = { ...baseBlock, id: 'block-1', summary: 'stale fallback' }

    expect(resolveSelectedGraphBlock([], 'block-2', staleFallback)).toBeNull()
  })
})
