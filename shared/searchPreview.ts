function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function splitSearchQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  )
}

export function buildSearchPreview(
  content: string,
  query: string,
  options: {
    maxLength?: number
    contextRadius?: number
  } = {},
): string {
  const normalizedContent = collapseWhitespace(content)

  if (!normalizedContent) {
    return ''
  }

  const maxLength = Math.max(12, options.maxLength ?? 180)
  const contextRadius = Math.max(8, options.contextRadius ?? Math.floor(maxLength * 0.45))
  const terms = splitSearchQueryTerms(query)

  if (terms.length === 0) {
    return normalizedContent.length > maxLength ? `${normalizedContent.slice(0, maxLength).trimEnd()}…` : normalizedContent
  }

  const lowerContent = normalizedContent.toLowerCase()
  let bestIndex = Number.POSITIVE_INFINITY
  let matchedTermLength = 0

  for (const term of terms) {
    const index = lowerContent.indexOf(term.toLowerCase())

    if (index !== -1 && index < bestIndex) {
      bestIndex = index
      matchedTermLength = term.length
    }
  }

  if (!Number.isFinite(bestIndex)) {
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'i')
    const match = pattern.exec(normalizedContent)

    if (!match || typeof match.index !== 'number') {
      return normalizedContent.length > maxLength ? `${normalizedContent.slice(0, maxLength).trimEnd()}…` : normalizedContent
    }

    bestIndex = match.index
    matchedTermLength = match[0].length
  }

  const windowStart = Math.max(0, bestIndex - contextRadius)
  const windowEnd = Math.min(normalizedContent.length, bestIndex + Math.max(matchedTermLength, 1) + contextRadius)
  let preview = normalizedContent.slice(windowStart, windowEnd).trim()

  if (preview.length > maxLength) {
    const overflow = preview.length - maxLength
    const trimLeft = Math.min(Math.floor(overflow / 2), Math.max(0, bestIndex - windowStart))
    const trimRight = overflow - trimLeft
    preview = preview.slice(trimLeft, Math.max(trimLeft, preview.length - trimRight)).trim()
  }

  if (windowStart > 0 && !preview.startsWith('…')) {
    preview = `…${preview}`
  }

  if (windowEnd < normalizedContent.length && !preview.endsWith('…')) {
    preview = `${preview}…`
  }

  return preview
}
