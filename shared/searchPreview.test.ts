import { describe, expect, it } from 'vitest'

import { buildSearchPreview, splitSearchQueryTerms } from './searchPreview'

describe('searchPreview', () => {
  it('splits query terms and deduplicates blanks', () => {
    expect(splitSearchQueryTerms(' Electron   IPC  Electron ')).toEqual(['Electron', 'IPC'])
  })

  it('builds a focused preview around matched terms', () => {
    const preview = buildSearchPreview(
      '第一段铺垫内容。这里开始提到 Electron 事件链路的排查过程，随后还有更多上下文说明。',
      'Electron',
      { maxLength: 36, contextRadius: 12 },
    )

    expect(preview).toContain('Electron')
    expect(preview.includes('…')).toBe(true)
  })

  it('falls back to the leading content when no term matches', () => {
    expect(buildSearchPreview('这是一个没有命中的长内容片段，用于回退预览逻辑。', 'Vue', { maxLength: 12 })).toBe('这是一个没有命中的长内容…')
  })
})
