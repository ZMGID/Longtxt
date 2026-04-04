import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownContent } from './MarkdownContent'
import { ATTACHMENT_PROTOCOL } from '../lib/attachmentUrl'

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

  it('rewrites managed local attachment urls for rendering', () => {
    render(<MarkdownContent content={`![本地图片](file:///tmp/local-image.png)`} />)

    expect(screen.getByAltText('本地图片')).toHaveAttribute(
      'src',
      `${ATTACHMENT_PROTOCOL}://asset?url=${encodeURIComponent('file:///tmp/local-image.png')}`,
    )
  })
})
