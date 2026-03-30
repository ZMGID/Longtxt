import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SearchPanel } from './SearchPanel'

describe('SearchPanel', () => {
  it('renders markdown output for generated documents', () => {
    render(
      <SearchPanel
        query="SiliconFlow"
        results={[]}
        browseTag={null}
        searchError={null}
        searching={false}
        generating={false}
        document={{
          status: 'done',
          requestId: '1',
          topic: '测试主题',
          content: '# 标题\n\n- 条目一\n- 条目二',
          blockIds: ['block-1'],
          mode: 'live',
          error: null,
        }}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onGenerate={vi.fn()}
        onSaveSnapshot={vi.fn()}
        onClearBrowseTag={vi.fn()}
        onTagClick={vi.fn()}
      />,
    )

    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('条目一')).toBeInTheDocument()
    expect(screen.getByText('条目二')).toBeInTheDocument()
  })
})
