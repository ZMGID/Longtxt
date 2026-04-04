import { describe, expect, it } from 'vitest'

import { parseMarkdownImage } from './markdownImage'

describe('parseMarkdownImage', () => {
  it('parses basic markdown image syntax', () => {
    expect(parseMarkdownImage('![截图](file:///tmp/a.png)')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
    })
  })

  it('supports markdown image titles', () => {
    expect(parseMarkdownImage('![截图](file:///tmp/a.png "title")')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
    })
  })

  it('returns null for non-image markdown', () => {
    expect(parseMarkdownImage('[链接](https://example.com)')).toBeNull()
  })
})
