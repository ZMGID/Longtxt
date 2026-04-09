import { useEffect, useMemo, type ReactNode } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { UI_SETTINGS_KEY } from '../../shared/config'
import type { UISettings } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'
import { messages, type MessageKey, resolveMessage } from './messages'
import { I18nContext, type I18nContextValue, type TranslateParams } from './context'
import {
  compareText,
  formatDateByLanguage,
  formatNumberByLanguage,
  formatRelativeTimeFromNow,
  getCurrentLanguage,
  normalizeLanguage,
  parseRendererUISettings,
  setCurrentLanguage,
  type AppLanguage,
  type RendererUISettings,
} from './locale'

const defaultSettings = parseRendererUISettings(null)

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template
  }

  return template.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in params)) {
      return ''
    }

    return `${params[key]}`
  })
}

function resolveTranslator(language: AppLanguage) {
  return (key: MessageKey, params?: TranslateParams): string => {
    const descriptor = messages[key]

    if (!descriptor) {
      return key
    }

    return interpolate(resolveMessage(key, language), params)
  }
}

function resolveUISettingsLanguage(settings: RendererUISettings | UISettings): AppLanguage {
  return normalizeLanguage((settings as Partial<RendererUISettings>).language)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: queryKeys.setting(UI_SETTINGS_KEY),
    queryFn: async () => parseRendererUISettings(await changbu.settings.get(UI_SETTINGS_KEY)),
  })

  useEffect(() => {
    return changbu.events.onMetaChanged((event) => {
      if (event.reason === 'settings') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.setting(UI_SETTINGS_KEY), exact: true })
      }
    })
  }, [queryClient])

  const uiSettings = settingsQuery.data ?? defaultSettings
  const language = resolveUISettingsLanguage(uiSettings)

  if (getCurrentLanguage() !== language) {
    setCurrentLanguage(language)
  }

  const t = useMemo(() => resolveTranslator(language), [language])
  const value = useMemo<I18nContextValue>(() => ({
    language,
    uiSettings,
    t,
    compareText: (left, right) => compareText(left, right, language),
    formatNumber: (number) => formatNumberByLanguage(number, language),
    formatDate: (date, options) => formatDateByLanguage(date, options, language),
    formatRelativeTime: (value) => formatRelativeTimeFromNow(value, language),
  }), [language, t, uiSettings])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}
