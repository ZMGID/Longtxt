import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { highlightText } from './highlight'

describe('highlightText', () => {
  it('highlights matching query terms', () => {
    render(<div>{highlightText('SiliconFlow 接入长布测试', 'SiliconFlow 测试')}</div>)

    expect(screen.getAllByText(/SiliconFlow|测试/)).toHaveLength(2)
    expect(document.querySelectorAll('mark')).toHaveLength(2)
  })
})
