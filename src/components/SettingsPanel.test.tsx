import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders and updates max reference block setting', () => {
    const onDocGenerationSettingsChange = vi.fn()

    render(
      <SettingsPanel
        config={{
          llm: {
            endpoint: '',
            apiKey: '',
            model: 'gpt-4o-mini',
          },
          embedding: {
            endpoint: '',
            apiKey: '',
            model: 'text-embedding-3-small',
          },
        }}
        docGenerationSettings={{
          maxReferenceBlocks: 10,
        }}
        meta={null}
        saving={false}
        testing={false}
        testResult={null}
        onChange={vi.fn()}
        onDocGenerationSettingsChange={onDocGenerationSettingsChange}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onOpenDataDirectory={vi.fn()}
      />,
    )

    const input = screen.getByRole('spinbutton', { name: /最大引用块数/ })
    expect(input).toHaveValue(10)

    fireEvent.change(input, { target: { value: '12' } })

    expect(onDocGenerationSettingsChange).toHaveBeenCalledWith({ maxReferenceBlocks: 12 })
  })
})
