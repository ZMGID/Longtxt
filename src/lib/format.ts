export function formatTimeLabel(value: string): string {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 1000 / 60)

  if (minutes < 1) {
    return '刚刚'
  }

  if (minutes < 60) {
    return `${minutes} 分钟前`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 24) {
    return `${hours} 小时前`
  }

  const days = Math.round(hours / 24)

  if (days < 7) {
    return `${days} 天前`
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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
  const date = new Date(`${dateKey}T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(options.weekday ? { weekday: 'short' } : {}),
  }).format(date)
}

export function formatClockTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
