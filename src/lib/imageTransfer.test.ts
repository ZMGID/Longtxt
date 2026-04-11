import { describe, expect, it } from 'vitest'

import { extractImageFiles, hasPotentialImageTransfer } from './imageTransfer'

describe('extractImageFiles', () => {
  it('extracts image files from transfer items', () => {
    const image = new File(['png'], 'note.png', { type: 'image/png' })
    const text = new File(['txt'], 'note.txt', { type: 'text/plain' })

    const files = extractImageFiles({
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
        { kind: 'file', type: 'text/plain', getAsFile: () => text },
      ],
    })

    expect(files).toEqual([image])
  })

  it('falls back to transfer files when items do not expose images', () => {
    const image = new File(['png'], 'drop.png', { type: 'image/png' })
    const text = new File(['txt'], 'note.txt', { type: 'text/plain' })

    const files = extractImageFiles({
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      files: [text, image],
    })

    expect(files).toEqual([image])
  })

  it('treats common image extensions as images when file type is empty', () => {
    const image = new File(['png'], 'finder-drop.png', { type: '' })

    const files = extractImageFiles({
      files: [image],
    })

    expect(files).toEqual([image])
  })

  it('returns an empty list when there are no image files', () => {
    const files = extractImageFiles({
      files: [new File(['txt'], 'note.txt', { type: 'text/plain' })],
    })

    expect(files).toEqual([])
  })

  it('treats a Files drag payload as a possible image transfer before files are exposed', () => {
    expect(hasPotentialImageTransfer({
      items: [{ kind: 'file', type: '', getAsFile: () => null }],
      types: ['Files'],
    })).toBe(true)
  })
})
