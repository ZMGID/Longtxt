const MARKDOWN_IMAGE_PATTERN = /^!\[([^\]]*)\]\((.*)\)$/
const MARKDOWN_IMAGE_TARGET_PATTERN = /^(.*?)(?:\s+"([^"]*)")?\s*$/
const MARKDOWN_IMAGE_FULL_SNAP_THRESHOLD = 24

export const MARKDOWN_IMAGE_PRESET_WIDTHS = {
  sm: 320,
  md: 520,
  lg: 720,
} as const

export type MarkdownImagePreset = keyof typeof MARKDOWN_IMAGE_PRESET_WIDTHS | 'full'

export type MarkdownImageDisplay =
  | { kind: 'auto' }
  | { kind: 'preset'; preset: MarkdownImagePreset }
  | { kind: 'width'; width: number }

export interface ParsedMarkdownImage {
  alt: string
  src: string
  title: string | null
  display: MarkdownImageDisplay
}

export function normalizeMarkdownImageWidth(width: number): number {
  return Math.min(1600, Math.max(120, Math.round(width)))
}

function isDisplayToken(token: string): boolean {
  return /^size=(?:auto|sm|md|lg|full)$/i.test(token) || /^w=\d{2,4}$/i.test(token)
}

export function parseMarkdownImageDisplay(title: string | null | undefined): MarkdownImageDisplay {
  const tokens = (title ?? '')
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean)

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]

    if (/^w=\d{2,4}$/i.test(token)) {
      return {
        kind: 'width',
        width: normalizeMarkdownImageWidth(Number(token.slice(2))),
      }
    }

    const presetMatch = token.match(/^size=(auto|sm|md|lg|full)$/i)
    if (!presetMatch) {
      continue
    }

    if (presetMatch[1].toLowerCase() === 'auto') {
      return { kind: 'auto' }
    }

    return {
      kind: 'preset',
      preset: presetMatch[1].toLowerCase() as MarkdownImagePreset,
    }
  }

  return { kind: 'auto' }
}

function normalizeMarkdownImageSrc(src: string): string {
  const trimmed = src.trim()

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function serializeMarkdownImageSrc(src: string): string {
  const trimmed = src.trim()

  if (!trimmed) {
    return ''
  }

  return /\s/.test(trimmed) ? `<${trimmed}>` : trimmed
}

function serializeDisplay(display: MarkdownImageDisplay): string | null {
  if (display.kind === 'auto') {
    return null
  }

  if (display.kind === 'width') {
    return `w=${normalizeMarkdownImageWidth(display.width)}`
  }

  return `size=${display.preset}`
}

function serializeMarkdownImageTitle(title: string): string {
  return title.replace(/"/g, '\'')
}

function buildTitleWithDisplay(title: string | null, display: MarkdownImageDisplay): string | null {
  const preservedTokens = (title ?? '')
    .split('|')
    .map((token) => token.trim())
    .filter((token) => token && !isDisplayToken(token))

  const displayToken = serializeDisplay(display)
  if (displayToken) {
    preservedTokens.push(displayToken)
  }

  if (preservedTokens.length === 0) {
    return null
  }

  return preservedTokens.join(' | ')
}

export function stringifyMarkdownImage(image: ParsedMarkdownImage): string {
  const nextTitle = buildTitleWithDisplay(image.title, image.display)
  const src = serializeMarkdownImageSrc(image.src)

  return `![${image.alt}](${src}${nextTitle ? ` "${serializeMarkdownImageTitle(nextTitle)}"` : ''})`
}

export function updateMarkdownImage(
  markdown: string,
  patch: Partial<Pick<ParsedMarkdownImage, 'alt' | 'src' | 'title' | 'display'>>,
): string | null {
  const parsed = parseMarkdownImage(markdown)

  if (!parsed) {
    return null
  }

  return stringifyMarkdownImage({
    alt: patch.alt ?? parsed.alt,
    src: patch.src ?? parsed.src,
    title: patch.title ?? parsed.title,
    display: patch.display ?? parsed.display,
  })
}

export function setMarkdownImageDisplay(markdown: string, display: MarkdownImageDisplay): string | null {
  return updateMarkdownImage(markdown, { display })
}

export function resolveMarkdownImageDisplayFromWidth(
  width: number,
  availableWidth?: number,
  snapThreshold = MARKDOWN_IMAGE_FULL_SNAP_THRESHOLD,
): MarkdownImageDisplay {
  const normalizedWidth = normalizeMarkdownImageWidth(width)
  const normalizedAvailableWidth = availableWidth ? normalizeMarkdownImageWidth(availableWidth) : null

  if (normalizedAvailableWidth && normalizedWidth >= normalizedAvailableWidth - snapThreshold) {
    return { kind: 'preset', preset: 'full' }
  }

  const matchedPreset = Object.entries(MARKDOWN_IMAGE_PRESET_WIDTHS)
    .find(([, presetWidth]) => Math.abs(presetWidth - normalizedWidth) <= snapThreshold)

  if (matchedPreset) {
    return {
      kind: 'preset',
      preset: matchedPreset[0] as MarkdownImagePreset,
    }
  }

  return {
    kind: 'width',
    width: normalizedWidth,
  }
}

export function parseMarkdownImage(markdown: string): ParsedMarkdownImage | null {
  const match = markdown.trim().match(MARKDOWN_IMAGE_PATTERN)

  if (!match) {
    return null
  }

  const target = (match[2] ?? '').trim()
  const targetMatch = target.match(MARKDOWN_IMAGE_TARGET_PATTERN)

  if (!targetMatch) {
    return null
  }

  const src = normalizeMarkdownImageSrc(targetMatch[1] ?? '')
  const title = targetMatch[2]?.trim() || null

  if (!src) {
    return null
  }

  return {
    alt: match[1]?.trim() ?? '',
    src,
    title,
    display: parseMarkdownImageDisplay(title),
  }
}
