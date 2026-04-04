const MARKDOWN_IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/

export interface ParsedMarkdownImage {
  alt: string
  src: string
}

export function parseMarkdownImage(markdown: string): ParsedMarkdownImage | null {
  const match = markdown.trim().match(MARKDOWN_IMAGE_PATTERN)

  if (!match) {
    return null
  }

  return {
    alt: match[1]?.trim() ?? '',
    src: match[2]?.trim() ?? '',
  }
}
