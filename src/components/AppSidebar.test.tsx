import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AppMeta } from '../../shared/types'
import { AppSidebar } from './AppSidebar'

const sampleMeta: AppMeta = {
  dataDirectory: '/tmp/changbu',
  totalBlockCount: 128,
  vectorReady: true,
  aiConfigured: true,
  resolvedBaseUrl: 'https://api.example.com',
  vectorDimension: 1024,
  vectorSchemaReady: true,
  activeAiMode: 'live',
  lastAiError: null,
  lastAiTestResult: null,
  modelCallCounts: {
    llm: 7,
    embedding: 3,
  },
  tokenUsage: null,
  lifetimeTokenUsage: null,
  failedVectorCount: 0,
  pendingVectorCount: 0,
  vectorQueueProcessing: false,
}

describe('AppSidebar', () => {
  it('renders a fixed icon sidebar with compact footer stats', () => {
    render(
      <AppSidebar
        activeView="search"
        blockCount={20}
        aiStatusLabel="已启用 live AI"
        meta={sampleMeta}
        onSelectView={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    expect(screen.getByTestId('app-sidebar').className).toContain('w-[60px]')
    expect(screen.getByRole('button', { name: '搜索生成' }).className).toContain('bg-stone-900/[0.08]')
    expect(screen.getByRole('button', { name: '数据管理' })).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('LLM')).toBeInTheDocument()
    expect(screen.getByText('向量')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('1k')).toBeInTheDocument()
  })

  it('calls the navigation handler', () => {
    const handleSelectView = vi.fn()

    render(
      <AppSidebar
        activeView="timeline"
        blockCount={20}
        aiStatusLabel="已启用 live AI"
        meta={sampleMeta}
        onSelectView={handleSelectView}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '笔记本' }))
    fireEvent.click(screen.getByRole('button', { name: '数据管理' }))

    expect(handleSelectView).toHaveBeenCalledWith('notebooks')
    expect(handleSelectView).toHaveBeenCalledWith('data-management')
  })
})
