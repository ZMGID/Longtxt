import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UI_SETTINGS_KEY } from '../../shared/config'
import { queryKeys } from '../lib/queryKeys'
import { I18nProvider } from './I18nProvider'
import { formatDateByLanguage, parseRendererUISettings, setCurrentLanguage } from './locale'

const { getSettingMock, onMetaChangedMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  onMetaChangedMock: vi.fn(() => () => {}),
}))

vi.mock('../lib/changbu', () => ({
  changbu: {
    settings: {
      get: getSettingMock,
    },
    events: {
      onMetaChanged: onMetaChangedMock,
    },
  },
}))

let currentUiSettingsRaw = JSON.stringify({
  showMiniTimeline: true,
  language: 'zh',
})

function FormattedMonth() {
  return (
    <div data-testid="formatted-month">
      {formatDateByLanguage('2026-04-01T00:00:00.000Z', {
        month: 'long',
        timeZone: 'UTC',
      })}
    </div>
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    currentUiSettingsRaw = JSON.stringify({
      showMiniTimeline: true,
      language: 'zh',
    })
    setCurrentLanguage('zh')
    getSettingMock.mockReset()
    getSettingMock.mockImplementation(async () => currentUiSettingsRaw)
    onMetaChangedMock.mockClear()
  })

  afterEach(() => {
    setCurrentLanguage('zh')
  })

  it('updates global locale-dependent formatters in the same rerender as a language switch', async () => {
    const zhQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    zhQueryClient.setQueryData(queryKeys.setting(UI_SETTINGS_KEY), parseRendererUISettings(currentUiSettingsRaw))

    const renderResult = render(
      <QueryClientProvider key="zh" client={zhQueryClient}>
        <I18nProvider key="zh">
          <FormattedMonth />
        </I18nProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('formatted-month')).toHaveTextContent(/四月|4月/)

    currentUiSettingsRaw = JSON.stringify({
      showMiniTimeline: true,
      language: 'en',
    })

    const enQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    enQueryClient.setQueryData(queryKeys.setting(UI_SETTINGS_KEY), parseRendererUISettings(currentUiSettingsRaw))

    await act(async () => {
      renderResult.rerender(
        <QueryClientProvider key="en" client={enQueryClient}>
          <I18nProvider key="en">
            <FormattedMonth />
          </I18nProvider>
        </QueryClientProvider>,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('formatted-month')).toHaveTextContent('April')
    })
  })
})
