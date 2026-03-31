import { describe, expect, it } from 'vitest'

import { DEFAULT_UI_SETTINGS, parseUISettings } from './config'

describe('parseUISettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseUISettings(null)).toEqual(DEFAULT_UI_SETTINGS)
    expect(parseUISettings('not-json')).toEqual(DEFAULT_UI_SETTINGS)
  })

  it('parses the mini timeline toggle', () => {
    expect(parseUISettings(JSON.stringify({ showMiniTimeline: false }))).toEqual({
      showMiniTimeline: false,
    })
  })
})
