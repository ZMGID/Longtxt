import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AI_CONFIG,
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
  DEFAULT_EXTERNAL_ACCESS_SETTINGS,
  DEFAULT_UI_SETTINGS,
  getAppDisplayName,
  getIntlLocale,
  getWindowTitle,
  parseAIConfig,
  parseBlockEnrichSettings,
  parseCalendarSettings,
  parseDocGenerationSettings,
  parseExternalAccessSettings,
  parseUISettings,
} from './config'

describe('parseDocGenerationSettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseDocGenerationSettings(null)).toEqual(DEFAULT_DOC_GENERATION_SETTINGS)
    expect(parseDocGenerationSettings('not-json')).toEqual(DEFAULT_DOC_GENERATION_SETTINGS)
  })

  it('normalizes doc generation tuning values', () => {
    expect(parseDocGenerationSettings(JSON.stringify({
      maxReferenceBlocks: 12,
      retrievalLimit: 40,
      temperature: 0.35,
      maxOutputTokens: 1800,
      streamOutput: false,
    }))).toEqual({
      maxReferenceBlocks: 12,
      retrievalLimit: 40,
      temperature: 0.35,
      maxOutputTokens: 1800,
      streamOutput: false,
    })
  })
})

describe('parseUISettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseUISettings(null)).toEqual(DEFAULT_UI_SETTINGS)
    expect(parseUISettings('not-json')).toEqual(DEFAULT_UI_SETTINGS)
  })

  it('parses the mini timeline toggle', () => {
    expect(parseUISettings(JSON.stringify({ showMiniTimeline: false }))).toEqual({
      showMiniTimeline: false,
      language: 'zh',
    })
  })

  it('keeps supported language values and normalizes invalid values', () => {
    expect(parseUISettings(JSON.stringify({ language: 'en' }))).toEqual({
      showMiniTimeline: true,
      language: 'en',
    })

    expect(parseUISettings(JSON.stringify({ showMiniTimeline: false, language: 'jp' }))).toEqual({
      showMiniTimeline: false,
      language: 'zh',
    })
  })
})

describe('parseAIConfig', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseAIConfig(null)).toEqual(DEFAULT_AI_CONFIG)
    expect(parseAIConfig('not-json')).toEqual(DEFAULT_AI_CONFIG)
  })

  it('keeps old configs compatible and defaults multimodal to false', () => {
    expect(parseAIConfig(JSON.stringify({
      llm: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'llm-key',
        model: 'gpt-4.1-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'embed-key',
        model: 'text-embedding-3-small',
      },
    }))).toEqual({
      llm: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'llm-key',
        model: 'gpt-4.1-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'embed-key',
        model: 'text-embedding-3-small',
      },
      multimodalImageAnalysisEnabled: false,
    })
  })

  it('normalizes invalid multimodal values to false', () => {
    expect(parseAIConfig(JSON.stringify({
      multimodalImageAnalysisEnabled: 'yes',
    }))).toEqual({
      ...DEFAULT_AI_CONFIG,
      multimodalImageAnalysisEnabled: false,
    })
  })
})

describe('language helpers', () => {
  it('resolves locale and app display name by language', () => {
    expect(getIntlLocale('zh')).toBe('zh-CN')
    expect(getIntlLocale('en')).toBe('en-US')
    expect(getAppDisplayName('zh')).toBe('长布')
    expect(getAppDisplayName('en')).toBe('Changbu')
  })

  it('builds localized window titles', () => {
    expect(getWindowTitle('main', 'zh')).toBe('长布')
    expect(getWindowTitle('settings', 'zh')).toBe('设置 - 长布')
    expect(getWindowTitle('review', 'zh', { reviewMode: 'ai-insights' })).toBe('AI 洞察 - 长布')
    expect(getWindowTitle('main', 'en')).toBe('Changbu')
    expect(getWindowTitle('settings', 'en')).toBe('Settings - Changbu')
    expect(getWindowTitle('review', 'en', { reviewMode: 'recent-shifts' })).toBe('Recent Shifts - Changbu')
  })
})

describe('parseBlockEnrichSettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseBlockEnrichSettings(null)).toEqual(DEFAULT_BLOCK_ENRICH_SETTINGS)
    expect(parseBlockEnrichSettings('not-json')).toEqual(DEFAULT_BLOCK_ENRICH_SETTINGS)
  })

  it('parses the live enrich queue toggle', () => {
    expect(parseBlockEnrichSettings(JSON.stringify({ queueEnabled: true }))).toEqual({
      queueEnabled: true,
      maxBatchBlocks: 5,
      queueDebounceMs: 800,
      responseReserveTokens: 1600,
    })
  })

  it('normalizes additional queue settings', () => {
    expect(parseBlockEnrichSettings(JSON.stringify({
      queueEnabled: true,
      maxBatchBlocks: 22,
      queueDebounceMs: 30,
      responseReserveTokens: 99_999,
    }))).toEqual({
      queueEnabled: true,
      maxBatchBlocks: 10,
      queueDebounceMs: 100,
      responseReserveTokens: 8192,
    })
  })
})

describe('parseCalendarSettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseCalendarSettings(null)).toEqual(DEFAULT_CALENDAR_SETTINGS)
    expect(parseCalendarSettings('not-json')).toEqual(DEFAULT_CALENDAR_SETTINGS)
  })

  it('normalizes calendar suggestion settings', () => {
    expect(parseCalendarSettings(JSON.stringify({
      aiSuggestionsEnabled: false,
      autoAcceptAiSuggestions: true,
      maxSuggestionsPerBlock: 99,
      upcomingDays: 999,
    }))).toEqual({
      aiSuggestionsEnabled: false,
      autoAcceptAiSuggestions: true,
      maxSuggestionsPerBlock: 8,
      upcomingDays: 120,
    })
  })
})

describe('parseExternalAccessSettings', () => {
  it('falls back to defaults when the saved value is missing or invalid', () => {
    expect(parseExternalAccessSettings(null)).toEqual(DEFAULT_EXTERNAL_ACCESS_SETTINGS)
    expect(parseExternalAccessSettings('not-json')).toEqual(DEFAULT_EXTERNAL_ACCESS_SETTINGS)
  })

  it('normalizes external access settings', () => {
    expect(parseExternalAccessSettings(JSON.stringify({
      enabled: true,
      generatedAt: '2026-04-07T12:00:00.000Z',
      skillTarget: 'claude-code',
    }))).toEqual({
      enabled: true,
      generatedAt: '2026-04-07T12:00:00.000Z',
      skillTarget: 'claude-code',
    })
  })
})
