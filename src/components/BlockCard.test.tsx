import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BlockCard } from './BlockCard'

const baseBlock = {
  id: 'block-1',
  tags: [],
  createdAt: '2026-03-31T09:00:00.000Z',
  updatedAt: '2026-03-31T10:00:00.000Z',
  status: 'ready' as const,
  aiMode: 'live' as const,
  summary: null,
  errorMessage: null,
}

describe('BlockCard', () => {
  it('collapses long content and can expand to full text', () => {
    const longContent = Array.from({ length: 18 }, (_, index) => `第 ${index + 1} 段内容，用来测试时间线中的长块折叠行为。`).join('\n\n')

    render(
      <BlockCard
        block={{
          ...baseBlock,
          content: longContent,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: '显示全文' })).toBeInTheDocument()
    expect(screen.getByTestId('block-card-content').className).toContain('max-h-[280px]')

    fireEvent.click(screen.getByRole('button', { name: '显示全文' }))

    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
    expect(screen.getByTestId('block-card-content').className).not.toContain('max-h-[280px]')
  })

  it('does not show collapse control for short content', () => {
    render(
      <BlockCard
        block={{
          ...baseBlock,
          content: '这是一段比较短的内容。',
        }}
      />,
    )

    expect(screen.queryByRole('button', { name: '显示全文' })).not.toBeInTheDocument()
  })
})
