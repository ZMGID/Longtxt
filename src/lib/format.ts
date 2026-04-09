import { formatDateByLanguage, formatRelativeTimeFromNow } from '../i18n/locale'

export function formatTimeLabel(value: string): string {
  return formatRelativeTimeFromNow(value)
}

export function formatLocalDateKey(value: string): string {
  const date = new Date(value)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function formatDateKeyLabel(dateKey: string, options: { weekday?: boolean } = {}): string {
  return formatDateByLanguage(new Date(`${dateKey}T00:00:00`), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(options.weekday ? { weekday: 'short' } : {}),
  })
}

export function formatClockTime(value: string): string {
  return formatDateByLanguage(new Date(value), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
