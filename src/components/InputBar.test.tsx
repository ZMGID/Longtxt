import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InputBar } from './InputBar'

vi.mock('./MarkdownLivePreview', () => ({
  MarkdownLivePreview: ({ className }: { className?: string }) => (
    <div data-testid="markdown-live-preview" data-class-name={className ?? ''} />
  ),
}))

describe('InputBar', () => {
  it('constrains the embedded editor height and keeps internal scrolling available', () => {
    render(<InputBar embedded onSubmit={vi.fn(async () => {})} />)

    expect(screen.getByText('继续往下写 · Enter 创建块 · Shift+Enter 换行 · 长内容可在输入区内滚动')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-scroller]:overflow-auto'),
    )
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-editor]:max-h-[52vh]'),
    )
  })

  it('also constrains the default editor height', () => {
    render(<InputBar onSubmit={vi.fn(async () => {})} />)

    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-editor]:max-h-[48vh]'),
    )
  })
})
