import { Fragment } from 'react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitQueryTerms(query: string): string[] {
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

export function highlightText(content: string, query: string): React.ReactNode {
  const terms = splitQueryTerms(query)

  if (terms.length === 0) {
    return content
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  const parts = content.split(pattern)

  return parts.map((part, index) => {
    if (!part) {
      return null
    }

    const isMatch = terms.some((term) => part.toLowerCase() === term.toLowerCase())

    if (!isMatch) {
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>
    }

    return (
      <mark key={`${part}-${index}`} className="rounded bg-orange-200/70 px-0.5 text-stone-950">
        {part}
      </mark>
    )
  })
}
