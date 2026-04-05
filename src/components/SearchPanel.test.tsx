import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SearchPanel } from './SearchPanel'
import { ToastProvider } from './Toast'

describe('SearchPanel', () => {
  const sampleResult = {
    block: {
      id: 'block-1',
      content: 'SiliconFlow 接入进展记录',
      tags: [
        {
          id: 'tag-1',
          name: '项目',
          isDefault: false,
          source: 'manual' as const,
          kind: 'user' as const,
        },
      ],
      createdAt: '2026-03-31T09:00:00.000Z',
      updatedAt: '2026-03-31T10:00:00.000Z',
      status: 'ready' as const,
      aiMode: 'live' as const,
      summary: null,
      errorMessage: null,
    },
    score: 0.92,
    matchSource: ['fts' as const],
  }

  it('renders markdown output for generated documents', () => {
    render(
      <ToastProvider>
        <SearchPanel
          query="SiliconFlow"
          results={[sampleResult]}
          resultsTitle="1 条检索结果"
          resultsEmptyHint="没有找到相关块，换个关键词试试。"
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
        />
      </ToastProvider>,
    )

    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('条目一')).toBeInTheDocument()
    expect(screen.getByText('条目二')).toBeInTheDocument()
    expect(screen.getByText('1 条检索结果')).toBeInTheDocument()
    expect(screen.getByText('全文命中')).toBeInTheDocument()
    expect(screen.getByTestId('search-results-scroll').className).toContain('overflow-y-auto')
    expect(screen.getByTestId('generated-document-scroll').className).toContain('overflow-y-auto')
  })

  it('renders multiple retrieval sources for the same result', () => {
    render(
      <ToastProvider>
        <SearchPanel
          query="SiliconFlow"
          results={[
            {
              ...sampleResult,
              matchSource: ['tag', 'vector'],
            },
          ]}
          resultsTitle="1 条检索结果"
          resultsEmptyHint="没有找到相关块，换个关键词试试。"
          browseTag={null}
          searchError={null}
          searching={false}
          generating={false}
          document={{
            status: 'idle',
            requestId: null,
            topic: '',
            content: '',
            blockIds: [],
            mode: 'mock',
            error: null,
          }}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('标签命中')).toBeInTheDocument()
    expect(screen.getByText('向量命中')).toBeInTheDocument()
  })

  it('renders recent blocks mode without search scores', () => {
    render(
      <ToastProvider>
        <SearchPanel
          query=""
          results={[
            {
              ...sampleResult,
              matchSource: [],
            },
          ]}
          resultsTitle="最近更新 · 1 个块"
          resultsEmptyHint="还没有块，先在时间轴记录一些内容。"
          showResultScore={false}
          resultMetaLabel="最近更新"
          browseTag={null}
          searchError={null}
          searching={false}
          generating={false}
          document={{
            status: 'idle',
            requestId: null,
            topic: '',
            content: '',
            blockIds: [],
            mode: 'mock',
            error: null,
          }}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('最近更新 · 1 个块')).toBeInTheDocument()
    expect(screen.getByText('最近更新')).toBeInTheDocument()
    expect(screen.queryByText(/得分/)).not.toBeInTheDocument()
    expect(screen.queryByText('全文命中')).not.toBeInTheDocument()
  })

  it('allows saving a generated document even when no source blocks were referenced', () => {
    render(
      <ToastProvider>
        <SearchPanel
          query="信息不足主题"
          results={[]}
          resultsTitle="0 条检索结果"
          resultsEmptyHint="没有找到相关块，换个关键词试试。"
          browseTag={null}
          searchError={null}
          searching={false}
          generating={false}
          document={{
            status: 'done',
            requestId: '2',
            topic: '信息不足主题',
            content: '# 信息不足\n\n当前没有足够相关块。',
            blockIds: [],
            mode: 'live',
            error: null,
          }}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: '保存快照' })).toBeInTheDocument()
  })
})
