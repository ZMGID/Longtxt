import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  it('renders paragraphs and markdown images', () => {
    const { container } = render(
      <MarkdownContent
        content={`第一段\n\n第二段\n\n![示意图](https://example.com/image.png)\n\n- 条目一\n- 条目二`}
      />,
    )

    expect(screen.getByText('第一段')).toBeInTheDocument()
    expect(screen.getByText('第二段')).toBeInTheDocument()
    expect(screen.getByAltText('示意图')).toHaveAttribute('src', 'https://example.com/image.png')
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })
})
