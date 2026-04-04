import { describe, expect, it } from 'vitest'

import { ATTACHMENT_PROTOCOL, toRenderableAttachmentUrl } from './attachmentUrl'

describe('toRenderableAttachmentUrl', () => {
  it('keeps remote urls unchanged', () => {
    expect(toRenderableAttachmentUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
  })

  it('rewrites local file urls to the custom attachment protocol', () => {
    expect(toRenderableAttachmentUrl('file:///tmp/demo.png')).toBe(
      `${ATTACHMENT_PROTOCOL}://asset?url=${encodeURIComponent('file:///tmp/demo.png')}`,
    )
  })

  it('returns empty string for empty input', () => {
    expect(toRenderableAttachmentUrl('')).toBe('')
  })
})
