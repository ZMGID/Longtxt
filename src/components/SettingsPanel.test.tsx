import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders and updates max reference block setting', () => {
    const onDocGenerationSettingsChange = vi.fn()
    const onBlockEnrichSettingsChange = vi.fn()
    const onCalendarSettingsChange = vi.fn()
    const onUISettingsChange = vi.fn()
    const onOpenSettingsDirectory = vi.fn()

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
          retrievalLimit: 30,
          temperature: 0.1,
          maxOutputTokens: 1200,
        }}
        blockEnrichSettings={{
          queueEnabled: false,
          maxBatchBlocks: 5,
          queueDebounceMs: 800,
          responseReserveTokens: 1600,
        }}
        calendarSettings={{
          aiSuggestionsEnabled: true,
          maxSuggestionsPerBlock: 3,
          upcomingDays: 30,
        }}
        uiSettings={{
          showMiniTimeline: true,
        }}
        meta={null}
        saving={false}
        testing={false}
        testResult={null}
        onChange={vi.fn()}
        onDocGenerationSettingsChange={onDocGenerationSettingsChange}
        onBlockEnrichSettingsChange={onBlockEnrichSettingsChange}
        onCalendarSettingsChange={onCalendarSettingsChange}
        onUISettingsChange={onUISettingsChange}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onOpenDataDirectory={vi.fn()}
        onOpenSettingsDirectory={onOpenSettingsDirectory}
      />,
    )

    const input = screen.getByRole('spinbutton', { name: /最大引用块数/ })
    expect(input).toHaveValue(10)

    fireEvent.change(input, { target: { value: '12' } })

    expect(onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 12,
      retrievalLimit: 30,
      temperature: 0.1,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /召回候选块数/ }), { target: { value: '40' } })
    expect(onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 40,
      temperature: 0.1,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /生成温度/ }), { target: { value: '0.35' } })
    expect(onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 30,
      temperature: 0.35,
      maxOutputTokens: 1200,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /输出 Token 上限/ }), { target: { value: '1800' } })
    expect(onDocGenerationSettingsChange).toHaveBeenCalledWith({
      maxReferenceBlocks: 10,
      retrievalLimit: 30,
      temperature: 0.1,
      maxOutputTokens: 1800,
    })

    const enrichQueueCheckbox = screen.getByRole('checkbox', { name: /启用 live enrich 队列/ })
    expect(enrichQueueCheckbox).not.toBeChecked()

    fireEvent.click(enrichQueueCheckbox)

    expect(onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: true,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /单次最多合并块数/ }), { target: { value: '7' } })
    expect(onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 7,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /聚合等待时间/ }), { target: { value: '1200' } })
    expect(onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 5,
      queueDebounceMs: 1200,
      responseReserveTokens: 1600,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /预留输出 Token/ }), { target: { value: '2400' } })
    expect(onBlockEnrichSettingsChange).toHaveBeenCalledWith({
      queueEnabled: false,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 2400,
    })

    const calendarSuggestionCheckbox = screen.getByRole('checkbox', { name: /启用 AI 日期建议/ })
    expect(calendarSuggestionCheckbox).toBeChecked()

    fireEvent.click(calendarSuggestionCheckbox)
    expect(onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: false,
      maxSuggestionsPerBlock: 3,
      upcomingDays: 30,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /每块最多建议条数/ }), { target: { value: '4' } })
    expect(onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: true,
      maxSuggestionsPerBlock: 4,
      upcomingDays: 30,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: /未来安排窗口/ }), { target: { value: '45' } })
    expect(onCalendarSettingsChange).toHaveBeenCalledWith({
      aiSuggestionsEnabled: true,
      maxSuggestionsPerBlock: 3,
      upcomingDays: 45,
    })

    const checkbox = screen.getByRole('checkbox', { name: /显示左侧时间线/ })
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)

    expect(onUISettingsChange).toHaveBeenCalledWith({ showMiniTimeline: false })

    fireEvent.click(screen.getByRole('button', { name: '打开设置文件目录' }))

    expect(onOpenSettingsDirectory).toHaveBeenCalledTimes(1)
  })
})
