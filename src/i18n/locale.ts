import {
  DEFAULT_UI_SETTINGS,
  normalizeUISettings,
  parseUISettings,
} from '../../shared/config'
import type { UISettings } from '../../shared/types'

export type AppLanguage = 'zh' | 'en'

export interface RendererUISettings extends UISettings {
  language: AppLanguage
}

const DEFAULT_LANGUAGE: AppLanguage = 'zh'
const LOCALE_MAP: Record<AppLanguage, string> = {
  zh: 'zh-CN',
  en: 'en-US',
}

let activeLanguage: AppLanguage = DEFAULT_LANGUAGE

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === 'en' ? 'en' : 'zh'
}

export function getIntlLocale(language: AppLanguage): string {
  return LOCALE_MAP[language]
}

export function getCurrentLanguage(): AppLanguage {
  return activeLanguage
}

export function setCurrentLanguage(language: AppLanguage): void {
  activeLanguage = language
}

export function getCurrentIntlLocale(): string {
  return getIntlLocale(getCurrentLanguage())
}

export function getAppDisplayName(language: AppLanguage): string {
  return language === 'en' ? 'Changbu' : '长布'
}

export function getLanguageLabel(language: AppLanguage, displayLanguage: AppLanguage = language): string {
  if (displayLanguage === 'en') {
    return language === 'en' ? 'English' : 'Chinese'
  }

  return language === 'en' ? 'English' : '中文'
}

export function compareText(a: string, b: string, language: AppLanguage = getCurrentLanguage()): number {
  return new Intl.Collator(getIntlLocale(language), { sensitivity: 'base', numeric: true }).compare(a, b)
}

export function compareIsoDateOrTime(left: string, right: string): number {
  return left.localeCompare(right)
}

export function formatNumberByLanguage(value: number, language: AppLanguage = getCurrentLanguage()): string {
  return new Intl.NumberFormat(getIntlLocale(language)).format(value)
}

export function formatDateByLanguage(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
  language: AppLanguage = getCurrentLanguage(),
): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(date)
}

export function formatRelativeTimeFromNow(value: Date | string | number, language: AppLanguage = getCurrentLanguage()): string {
  const date = value instanceof Date ? value : new Date(value)
  const diffMs = date.getTime() - Date.now()
  const absSeconds = Math.abs(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(getIntlLocale(language), { numeric: 'auto' })

  if (absSeconds < 60) {
    return language === 'en' ? 'just now' : '刚刚'
  }

  const absMinutes = absSeconds / 60
  if (absMinutes < 60) {
    return rtf.format(Math.round(diffMs / (60 * 1000)), 'minute')
  }

  const absHours = absMinutes / 60
  if (absHours < 24) {
    return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour')
  }

  const absDays = absHours / 24
  if (absDays < 7) {
    return rtf.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day')
  }

  return formatDateByLanguage(date, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }, language)
}

export function getLanguageFromUISettings(value: UISettings | RendererUISettings | null | undefined): AppLanguage {
  if (!isRecord(value)) {
    return DEFAULT_LANGUAGE
  }

  return normalizeLanguage(value.language)
}

export function normalizeRendererUISettings(
  value: Partial<RendererUISettings> | Partial<UISettings> | null | undefined,
): RendererUISettings {
  return {
    ...normalizeUISettings(value),
    language: getLanguageFromUISettings(value as UISettings),
  }
}

export function parseRendererUISettings(raw: string | null): RendererUISettings {
  const base = parseUISettings(raw)

  if (!raw) {
    return {
      ...base,
      language: DEFAULT_LANGUAGE,
    }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    const language = isRecord(parsed) ? normalizeLanguage(parsed.language) : DEFAULT_LANGUAGE
    return {
      ...base,
      language,
    }
  } catch {
    return {
      ...DEFAULT_UI_SETTINGS,
      language: DEFAULT_LANGUAGE,
    }
  }
}

export function withRendererLanguage(settings: UISettings | RendererUISettings, language: AppLanguage): RendererUISettings {
  return {
    ...normalizeUISettings(settings),
    language,
  }
}
