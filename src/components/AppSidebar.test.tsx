import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AppMeta } from '../../shared/types'
import { AppSidebar } from './AppSidebar'

const sampleMeta: AppMeta = {
  dataDirectory: '/tmp/changbu',
  vectorReady: true,
  aiConfigured: true,
  resolvedBaseUrl: 'https://api.example.com',
  vectorDimension: 1024,
  vectorSchemaReady: true,
  activeAiMode: 'live',
  lastAiError: null,
  lastAiTestResult: null,
  tokenUsage: null,
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
      />,
    )

    expect(screen.getByTestId('app-sidebar').className).toContain('w-[68px]')
    expect(screen.getByRole('button', { name: '搜索生成' }).className).toContain('bg-black/[0.08]')
    expect(screen.getByText('20')).toBeInTheDocument()
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
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '笔记本' }))

    expect(handleSelectView).toHaveBeenCalledWith('notebooks')
  })
})
