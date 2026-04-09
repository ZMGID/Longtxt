import type {
  AIConfig,
  AppLanguage,
  BlockEnrichSettings,
  CalendarSettings,
  DocGenerationSettings,
  ExternalAccessSettings,
  ReviewMode,
  UISettings,
} from './types'

export const APP_NAME = '长布'
export const DEFAULT_APP_LANGUAGE: AppLanguage = 'zh'

export const DEFAULT_PAGE_SIZE = 200
export const BLOCK_ENRICH_SETTINGS_KEY = 'block_enrich_settings'
export const CALENDAR_SETTINGS_KEY = 'calendar_settings'
export const DOC_GENERATION_SETTINGS_KEY = 'doc_generation_settings'
export const EXTERNAL_ACCESS_SETTINGS_KEY = 'external_access_settings'
export const UI_SETTINGS_KEY = 'ui_settings'
export const MIN_BLOCK_ENRICH_BATCH_BLOCKS = 1
export const MAX_BLOCK_ENRICH_BATCH_BLOCKS = 10
export const MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS = 100
export const MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS = 5_000
export const MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS = 256
export const MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS = 8_192
export const MIN_DOC_GENERATION_REFERENCE_BLOCKS = 1
export const MAX_DOC_GENERATION_REFERENCE_BLOCKS = 30
export const MIN_DOC_GENERATION_RETRIEVAL_LIMIT = 10
export const MAX_DOC_GENERATION_RETRIEVAL_LIMIT = 100
export const MIN_DOC_GENERATION_TEMPERATURE = 0
export const MAX_DOC_GENERATION_TEMPERATURE = 1
export const MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS = 200
export const MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS = 4_000
export const MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK = 0
export const MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK = 8
export const MIN_CALENDAR_UPCOMING_DAYS = 1
export const MAX_CALENDAR_UPCOMING_DAYS = 120

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
  multimodalImageAnalysisEnabled: false,
}

export const DEFAULT_DOC_GENERATION_SETTINGS: DocGenerationSettings = {
  maxReferenceBlocks: 10,
  retrievalLimit: 30,
  temperature: 0.1,
  maxOutputTokens: 1200,
  streamOutput: true,
}

export const DEFAULT_BLOCK_ENRICH_SETTINGS: BlockEnrichSettings = {
  queueEnabled: false,
  maxBatchBlocks: 5,
  queueDebounceMs: 800,
  responseReserveTokens: 1_600,
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  showMiniTimeline: true,
  language: DEFAULT_APP_LANGUAGE,
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  aiSuggestionsEnabled: true,
  autoAcceptAiSuggestions: false,
  maxSuggestionsPerBlock: 3,
  upcomingDays: 30,
}

export const DEFAULT_EXTERNAL_ACCESS_SETTINGS: ExternalAccessSettings = {
  enabled: false,
  generatedAt: null,
  skillTarget: 'claude-code',
}

export function normalizeAIConfig(
  value: Partial<AIConfig> | null | undefined,
): AIConfig {
  return {
    llm: {
      ...DEFAULT_AI_CONFIG.llm,
      ...value?.llm,
    },
    embedding: {
      ...DEFAULT_AI_CONFIG.embedding,
      ...value?.embedding,
    },
    multimodalImageAnalysisEnabled: typeof value?.multimodalImageAnalysisEnabled === 'boolean'
      ? value.multimodalImageAnalysisEnabled
      : DEFAULT_AI_CONFIG.multimodalImageAnalysisEnabled,
  }
}

export function parseAIConfig(raw: string | null): AIConfig {
  if (!raw) {
    return DEFAULT_AI_CONFIG
  }

  try {
    return normalizeAIConfig(JSON.parse(raw) as Partial<AIConfig>)
  } catch {
    return DEFAULT_AI_CONFIG
  }
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

function clampDocGenerationRetrievalLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit
  }

  return Math.min(
    MAX_DOC_GENERATION_RETRIEVAL_LIMIT,
    Math.max(MIN_DOC_GENERATION_RETRIEVAL_LIMIT, Math.round(value)),
  )
}

function clampDocGenerationTemperature(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DOC_GENERATION_SETTINGS.temperature
  }

  return Math.min(
    MAX_DOC_GENERATION_TEMPERATURE,
    Math.max(MIN_DOC_GENERATION_TEMPERATURE, Number(value.toFixed(2))),
  )
}

function clampDocGenerationMaxOutputTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens
  }

  return Math.min(
    MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS,
    Math.max(MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS, Math.round(value)),
  )
}

function clampBlockEnrichBatchBlocks(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks
  }

  return Math.min(
    MAX_BLOCK_ENRICH_BATCH_BLOCKS,
    Math.max(MIN_BLOCK_ENRICH_BATCH_BLOCKS, Math.round(value)),
  )
}

function clampBlockEnrichQueueDebounceMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs
  }

  return Math.min(
    MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS,
    Math.max(MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS, Math.round(value)),
  )
}

function clampBlockEnrichResponseReserveTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens
  }

  return Math.min(
    MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS,
    Math.max(MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS, Math.round(value)),
  )
}

function clampCalendarMaxSuggestionsPerBlock(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock
  }

  return Math.min(
    MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK,
    Math.max(MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK, Math.round(value)),
  )
}

function clampCalendarUpcomingDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CALENDAR_SETTINGS.upcomingDays
  }

  return Math.min(
    MAX_CALENDAR_UPCOMING_DAYS,
    Math.max(MIN_CALENDAR_UPCOMING_DAYS, Math.round(value)),
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
    retrievalLimit: clampDocGenerationRetrievalLimit(
      typeof value?.retrievalLimit === 'number'
        ? value.retrievalLimit
        : DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit,
    ),
    temperature: clampDocGenerationTemperature(
      typeof value?.temperature === 'number'
        ? value.temperature
        : DEFAULT_DOC_GENERATION_SETTINGS.temperature,
    ),
    maxOutputTokens: clampDocGenerationMaxOutputTokens(
      typeof value?.maxOutputTokens === 'number'
        ? value.maxOutputTokens
        : DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens,
    ),
    streamOutput: typeof value?.streamOutput === 'boolean'
      ? value.streamOutput
      : DEFAULT_DOC_GENERATION_SETTINGS.streamOutput,
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

export function normalizeBlockEnrichSettings(
  value: Partial<BlockEnrichSettings> | null | undefined,
): BlockEnrichSettings {
  return {
    queueEnabled: typeof value?.queueEnabled === 'boolean'
      ? value.queueEnabled
      : DEFAULT_BLOCK_ENRICH_SETTINGS.queueEnabled,
    maxBatchBlocks: clampBlockEnrichBatchBlocks(
      typeof value?.maxBatchBlocks === 'number'
        ? value.maxBatchBlocks
        : DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks,
    ),
    queueDebounceMs: clampBlockEnrichQueueDebounceMs(
      typeof value?.queueDebounceMs === 'number'
        ? value.queueDebounceMs
        : DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs,
    ),
    responseReserveTokens: clampBlockEnrichResponseReserveTokens(
      typeof value?.responseReserveTokens === 'number'
        ? value.responseReserveTokens
        : DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens,
    ),
  }
}

export function parseBlockEnrichSettings(raw: string | null): BlockEnrichSettings {
  if (!raw) {
    return DEFAULT_BLOCK_ENRICH_SETTINGS
  }

  try {
    return normalizeBlockEnrichSettings(JSON.parse(raw) as Partial<BlockEnrichSettings>)
  } catch {
    return DEFAULT_BLOCK_ENRICH_SETTINGS
  }
}

export function normalizeCalendarSettings(
  value: Partial<CalendarSettings> | null | undefined,
): CalendarSettings {
  return {
    aiSuggestionsEnabled: typeof value?.aiSuggestionsEnabled === 'boolean'
      ? value.aiSuggestionsEnabled
      : DEFAULT_CALENDAR_SETTINGS.aiSuggestionsEnabled,
    autoAcceptAiSuggestions: typeof value?.autoAcceptAiSuggestions === 'boolean'
      ? value.autoAcceptAiSuggestions
      : DEFAULT_CALENDAR_SETTINGS.autoAcceptAiSuggestions,
    maxSuggestionsPerBlock: clampCalendarMaxSuggestionsPerBlock(
      typeof value?.maxSuggestionsPerBlock === 'number'
        ? value.maxSuggestionsPerBlock
        : DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock,
    ),
    upcomingDays: clampCalendarUpcomingDays(
      typeof value?.upcomingDays === 'number'
        ? value.upcomingDays
        : DEFAULT_CALENDAR_SETTINGS.upcomingDays,
    ),
  }
}

export function parseCalendarSettings(raw: string | null): CalendarSettings {
  if (!raw) {
    return DEFAULT_CALENDAR_SETTINGS
  }

  try {
    return normalizeCalendarSettings(JSON.parse(raw) as Partial<CalendarSettings>)
  } catch {
    return DEFAULT_CALENDAR_SETTINGS
  }
}

export function normalizeUISettings(
  value: Partial<UISettings> | null | undefined,
): UISettings {
  return {
    showMiniTimeline: typeof value?.showMiniTimeline === 'boolean'
      ? value.showMiniTimeline
      : DEFAULT_UI_SETTINGS.showMiniTimeline,
    language: value?.language === 'en' || value?.language === 'zh'
      ? value.language
      : DEFAULT_UI_SETTINGS.language,
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

export function getIntlLocale(language: AppLanguage): string {
  return language === 'en' ? 'en-US' : 'zh-CN'
}

export function getAppDisplayName(language: AppLanguage): string {
  return language === 'en' ? 'Changbu' : APP_NAME
}

export function getCollator(
  language: AppLanguage,
  options?: Intl.CollatorOptions,
): Intl.Collator {
  return new Intl.Collator(getIntlLocale(language), options)
}

export function getNumberFormatter(
  language: AppLanguage,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return new Intl.NumberFormat(getIntlLocale(language), options)
}

export function getDateFormatter(
  language: AppLanguage,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getIntlLocale(language), options)
}

interface WindowTitleOptions {
  reviewMode?: ReviewMode | string | null
}

export function getWindowTitle(
  kind: 'main' | 'settings' | 'review',
  language: AppLanguage,
  options: WindowTitleOptions = {},
): string {
  const appName = getAppDisplayName(language)
  const reviewMode = options.reviewMode ?? 'daily-review'
  const isEnglish = language === 'en'

  if (kind === 'main') {
    return appName
  }

  if (kind === 'settings') {
    return isEnglish ? `Settings - ${appName}` : `设置 - ${appName}`
  }

  if (reviewMode === 'ai-insights') {
    return isEnglish ? `AI Insights - ${appName}` : `AI 洞察 - ${appName}`
  }

  if (reviewMode === 'recent-shifts') {
    return isEnglish ? `Recent Shifts - ${appName}` : `近期变化 - ${appName}`
  }

  return isEnglish ? `Daily Review - ${appName}` : `每日回顾 - ${appName}`
}

export function normalizeExternalAccessSettings(
  value: Partial<ExternalAccessSettings> | null | undefined,
): ExternalAccessSettings {
  return {
    enabled: typeof value?.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_EXTERNAL_ACCESS_SETTINGS.enabled,
    generatedAt: typeof value?.generatedAt === 'string' && value.generatedAt.trim()
      ? value.generatedAt
      : DEFAULT_EXTERNAL_ACCESS_SETTINGS.generatedAt,
    skillTarget: value?.skillTarget === 'claude-code'
      ? value.skillTarget
      : DEFAULT_EXTERNAL_ACCESS_SETTINGS.skillTarget,
  }
}

export function parseExternalAccessSettings(raw: string | null): ExternalAccessSettings {
  if (!raw) {
    return DEFAULT_EXTERNAL_ACCESS_SETTINGS
  }

  try {
    return normalizeExternalAccessSettings(JSON.parse(raw) as Partial<ExternalAccessSettings>)
  } catch {
    return DEFAULT_EXTERNAL_ACCESS_SETTINGS
  }
}
