import type { AIConfig, DocGenerationSettings, UISettings } from './types'

export const APP_NAME = '长布'

export const DEFAULT_PAGE_SIZE = 200
export const DOC_GENERATION_SETTINGS_KEY = 'doc_generation_settings'
export const UI_SETTINGS_KEY = 'ui_settings'
export const MIN_DOC_GENERATION_REFERENCE_BLOCKS = 1
export const MAX_DOC_GENERATION_REFERENCE_BLOCKS = 30

export const DEFAULT_AI_CONFIG: AIConfig = {
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
}

export const DEFAULT_DOC_GENERATION_SETTINGS: DocGenerationSettings = {
  maxReferenceBlocks: 10,
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  showMiniTimeline: true,
}

function clampDocGenerationReferenceBlocks(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks
  }

  return Math.min(
    MAX_DOC_GENERATION_REFERENCE_BLOCKS,
    Math.max(MIN_DOC_GENERATION_REFERENCE_BLOCKS, Math.round(value)),
  )
}

export function normalizeDocGenerationSettings(
  value: Partial<DocGenerationSettings> | null | undefined,
): DocGenerationSettings {
  return {
    maxReferenceBlocks: clampDocGenerationReferenceBlocks(
      typeof value?.maxReferenceBlocks === 'number'
        ? value.maxReferenceBlocks
        : DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks,
    ),
  }
}

export function parseDocGenerationSettings(raw: string | null): DocGenerationSettings {
  if (!raw) {
    return DEFAULT_DOC_GENERATION_SETTINGS
  }

  try {
    return normalizeDocGenerationSettings(JSON.parse(raw) as Partial<DocGenerationSettings>)
  } catch {
    return DEFAULT_DOC_GENERATION_SETTINGS
  }
}

export function normalizeUISettings(
  value: Partial<UISettings> | null | undefined,
): UISettings {
  return {
    showMiniTimeline: typeof value?.showMiniTimeline === 'boolean'
      ? value.showMiniTimeline
      : DEFAULT_UI_SETTINGS.showMiniTimeline,
  }
}

export function parseUISettings(raw: string | null): UISettings {
  if (!raw) {
    return DEFAULT_UI_SETTINGS
  }

  try {
    return normalizeUISettings(JSON.parse(raw) as Partial<UISettings>)
  } catch {
    return DEFAULT_UI_SETTINGS
  }
}
