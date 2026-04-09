import { createContext } from 'react'

import {
  compareText,
  formatDateByLanguage,
  formatNumberByLanguage,
  formatRelativeTimeFromNow,
  getCurrentLanguage,
  type AppLanguage,
  type RendererUISettings,
} from './locale'
import { messages, resolveMessage, type MessageKey } from './messages'

export interface TranslateParams {
  [name: string]: string | number
}

export interface I18nContextValue {
  language: AppLanguage
  uiSettings: RendererUISettings
  t: (key: MessageKey, params?: TranslateParams) => string
  compareText: (left: string, right: string) => number
  formatNumber: (value: number) => string
  formatDate: (value: Date | string | number, options: Intl.DateTimeFormatOptions) => string
  formatRelativeTime: (value: Date | string | number) => string
}

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

export const I18nContext = createContext<I18nContextValue>({
  language: getCurrentLanguage(),
  uiSettings: {
    showMiniTimeline: true,
    language: 'zh',
  },
  t: (key, params) => interpolate(resolveMessage(key, 'zh'), params),
  compareText: (left, right) => compareText(left, right, 'zh'),
  formatNumber: (value) => formatNumberByLanguage(value, 'zh'),
  formatDate: (value, options) => formatDateByLanguage(value, options, 'zh'),
  formatRelativeTime: (value) => formatRelativeTimeFromNow(value, 'zh'),
})

export function hasMessageKey(key: string): key is MessageKey {
  return key in messages
}
