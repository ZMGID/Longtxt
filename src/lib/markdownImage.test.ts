import { describe, expect, it } from 'vitest'

import {
  normalizeMarkdownImageWidth,
  parseMarkdownImage,
  parseMarkdownImageDisplay,
  resolveMarkdownImageDisplayFromWidth,
  setMarkdownImageDisplay,
  stringifyMarkdownImage,
  updateMarkdownImage,
} from './markdownImage'

describe('markdown image helpers', () => {
  it('parses basic markdown image syntax', () => {
    expect(parseMarkdownImage('![截图](file:///tmp/a.png)')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
      title: null,
      display: { kind: 'auto' },
    })
  })

  it('supports markdown image titles', () => {
    expect(parseMarkdownImage('![截图](file:///tmp/a.png "title")')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
      title: 'title',
      display: { kind: 'auto' },
    })
  })

  it('parses image sources with surrounding whitespace', () => {
    expect(parseMarkdownImage('![截图](   file:///tmp/a.png   "title"   )')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
      title: 'title',
      display: { kind: 'auto' },
    })
  })

  it('extracts display directives from title tokens', () => {
    expect(parseMarkdownImage('![截图](file:///tmp/a.png "封面 | w=520")')).toEqual({
      alt: '截图',
      src: 'file:///tmp/a.png',
      title: '封面 | w=520',
      display: { kind: 'width', width: 520 },
    })
  })

  it('parses preset display tokens directly', () => {
    expect(parseMarkdownImageDisplay('size=full')).toEqual({
      kind: 'preset',
      preset: 'full',
    })
  })

  it('falls back to auto display when title is empty', () => {
    expect(parseMarkdownImageDisplay(null)).toEqual({
      kind: 'auto',
    })
  })

  it('updates markdown image display while preserving non-display titles', () => {
    expect(setMarkdownImageDisplay('![截图](file:///tmp/a.png "封面")', { kind: 'preset', preset: 'lg' })).toBe(
      '![截图](file:///tmp/a.png "封面 | size=lg")',
    )
  })

  it('removes display directives when switching back to auto', () => {
    expect(setMarkdownImageDisplay('![截图](file:///tmp/a.png "封面 | w=520")', { kind: 'auto' })).toBe(
      '![截图](file:///tmp/a.png "封面")',
    )
  })

  it('writes a fresh display title when the image had none before', () => {
    expect(setMarkdownImageDisplay('![截图](file:///tmp/a.png)', { kind: 'width', width: 480 })).toBe(
      '![截图](file:///tmp/a.png "w=480")',
    )
  })

  it('updates image src while preserving title tokens and display', () => {
    expect(
      updateMarkdownImage(
        '![截图](file:///tmp/a.png "封面 | size=lg")',
        { src: 'file:///tmp/b.png' },
      ),
    ).toBe('![截图](file:///tmp/b.png "封面 | size=lg")')
  })

  it('stringifies image markdown while wrapping spaced urls', () => {
    expect(
      stringifyMarkdownImage({
        alt: '截图',
        src: 'file:///tmp/my image.png',
        title: '封面',
        display: { kind: 'width', width: 512 },
      }),
    ).toBe('![截图](<file:///tmp/my image.png> "封面 | w=512")')
  })

  it('snaps resized widths to preset values and full width', () => {
    expect(resolveMarkdownImageDisplayFromWidth(517, 900)).toEqual({
      kind: 'preset',
      preset: 'md',
    })

    expect(resolveMarkdownImageDisplayFromWidth(888, 900)).toEqual({
      kind: 'preset',
      preset: 'full',
    })

    expect(resolveMarkdownImageDisplayFromWidth(463, 900)).toEqual({
      kind: 'width',
      width: normalizeMarkdownImageWidth(463),
    })
  })

  it('returns null for non-image markdown updates', () => {
    expect(setMarkdownImageDisplay('[链接](https://example.com)', { kind: 'auto' })).toBeNull()
  })

  it('returns null for non-image markdown parsing', () => {
    expect(parseMarkdownImage('[链接](https://example.com)')).toBeNull()
  })
})
