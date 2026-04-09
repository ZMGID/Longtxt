import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchPanel } from './SearchPanel'
import { ToastProvider } from './Toast'

vi.mock('react-virtuoso', async () => {
  type MockVirtuosoProps = {
    data: Array<ComponentProps<typeof SearchPanel>['results'][number]>
    itemContent: (index: number, item: ComponentProps<typeof SearchPanel>['results'][number]) => ReactNode
    computeItemKey?: (index: number, item: ComponentProps<typeof SearchPanel>['results'][number]) => string
    style?: CSSProperties
  }

  const MockVirtuoso = forwardRef<HTMLDivElement, MockVirtuosoProps>(function MockVirtuoso(props, _ref) {
    return (
      <div
        data-testid="mock-virtuoso"
        data-first-item-key={props.data[0] && props.computeItemKey ? props.computeItemKey(0, props.data[0]) : ''}
        style={props.style}
      >
        {props.data.map((item, index) => props.itemContent(index, item))}
      </div>
    )
  })

  return {
    Virtuoso: MockVirtuoso,
  }
})

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
}

describe('SearchPanel', () => {
  beforeEach(() => {
    setViewport(1600, 1000)
  })

  const sampleNotebook = {
    id: 'notebook-1',
    title: '产品整理',
    createdAt: '2026-03-31T08:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
    itemCount: 3,
    blockCount: 1,
    structureCount: 2,
  }
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
          documentReferences={[sampleResult]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={null}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('条目一')).toBeInTheDocument()
    expect(screen.getByText('条目二')).toBeInTheDocument()
    expect(screen.getByText('1 条检索结果')).toBeInTheDocument()
    expect(screen.getAllByText('全文命中').length).toBeGreaterThan(0)
    expect(screen.getByTestId('search-results-scroll').className).toContain('overflow-y-auto')
    expect(screen.getByTestId('generated-document-scroll').className).toContain('overflow-y-auto')
    expect(screen.getByTestId('mock-virtuoso')).toHaveAttribute('data-first-item-key', 'block-1')
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
          documentReferences={[]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={null}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
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
          documentReferences={[]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={null}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('最近更新 · 1 个块')).toBeInTheDocument()
    expect(screen.getByText('最近更新')).toBeInTheDocument()
    expect(screen.queryByText(/得分/)).not.toBeInTheDocument()
    expect(screen.queryByText('全文命中')).not.toBeInTheDocument()
  })

  it('shows generated reference blocks and notebook deposition actions', () => {
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
          documentReferences={[sampleResult]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={{ id: 'notebook-1', title: '产品整理' }}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('本次参考块')).toBeInTheDocument()
    expect(screen.getByText('本次参考')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建 notebook' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加入当前 notebook「产品整理」' })).toBeInTheDocument()
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
          documentReferences={[]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={null}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: '保存快照' })).toBeInTheDocument()
  })

  it('supports jumping to timeline and collecting result blocks into notebooks', async () => {
    const onJumpToTimeline = vi.fn(async () => true)
    const onAddResultToNotebook = vi.fn(async () => {})
    const onUpdateResult = vi.fn(async () => {})
    const onDeleteResult = vi.fn(async () => {})

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
            status: 'idle',
            requestId: null,
            topic: '',
            content: '',
            blockIds: [],
            mode: 'mock',
            error: null,
          }}
          documentReferences={[]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={null}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={onJumpToTimeline}
          jumpingToTimelineBlockId={null}
          onUpdateResult={onUpdateResult}
          onDeleteResult={onDeleteResult}
          onAddResultToNotebook={onAddResultToNotebook}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '跳转到时间轴' }))
    expect(onJumpToTimeline).toHaveBeenCalledWith('block-1')

    fireEvent.click(screen.getByRole('button', { name: '收录到笔记本' }))
    fireEvent.click(await screen.findByRole('button', { name: /产品整理/ }))

    expect(onAddResultToNotebook).toHaveBeenCalledWith('notebook-1', 'block-1')
  })

  it('hides the generated document area on compact windows and keeps only retrieval results', () => {
    setViewport(900, 700)

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
          documentReferences={[sampleResult]}
          documentReferencesLoading={false}
          notebooks={[sampleNotebook]}
          selectedNotebook={{ id: 'notebook-1', title: '产品整理' }}
          documentDepositAction={null}
          onQueryChange={vi.fn()}
          onSearch={vi.fn()}
          onGenerate={vi.fn()}
          onSaveSnapshot={vi.fn()}
          onDepositToNewNotebook={vi.fn()}
          onDepositToCurrentNotebook={vi.fn()}
          onClearBrowseTag={vi.fn()}
          onTagClick={vi.fn()}
          onJumpToTimeline={vi.fn(async () => true)}
          jumpingToTimelineBlockId={null}
          onAddResultToNotebook={vi.fn(async () => {})}
          onCreateNotebookWithResult={vi.fn(async () => {})}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('当前窗口较小，已自动收起生成区；放大窗口后可查看生成文档与参考块。')).toBeInTheDocument()
    expect(screen.getByTestId('search-results-scroll')).toBeInTheDocument()
    expect(screen.queryByTestId('generated-document-scroll')).not.toBeInTheDocument()
    expect(screen.queryByTestId('search-document-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('本次参考块')).not.toBeInTheDocument()
  })
})
