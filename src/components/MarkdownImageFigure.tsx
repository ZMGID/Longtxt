import type { CSSProperties } from 'react'

import {
  MARKDOWN_IMAGE_PRESET_WIDTHS,
  parseMarkdownImageDisplay,
  type MarkdownImageDisplay,
} from '../lib/markdownImage'
import { toRenderableAttachmentUrl } from '../lib/attachmentUrl'

interface MarkdownImageFigureProps {
  src?: string
  alt?: string
  title?: string | null
}

function resolveFigureClassName(display: MarkdownImageDisplay): string {
  const baseClassName = 'max-w-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-stone-50'

  if (display.kind === 'auto') {
    return `inline-flex ${baseClassName}`
  }

  return `flex ${baseClassName}`
}

function resolveFigureStyle(display: MarkdownImageDisplay): CSSProperties | undefined {
  if (display.kind === 'width') {
    return {
      width: `${display.width}px`,
      maxWidth: '100%',
    }
  }

  if (display.kind === 'preset') {
    if (display.preset === 'full') {
      return {
        width: '100%',
        maxWidth: '100%',
      }
    }

    return {
      width: `${MARKDOWN_IMAGE_PRESET_WIDTHS[display.preset]}px`,
      maxWidth: '100%',
    }
  }

  return undefined
}

function resolveImageClassName(display: MarkdownImageDisplay): string {
  if (display.kind === 'auto') {
    return 'block h-auto max-h-[560px] w-auto max-w-full object-contain bg-stone-50'
  }

  return 'block h-auto max-h-[560px] w-full max-w-full object-contain bg-stone-50'
}

export function MarkdownImageFigure({ src, alt, title }: MarkdownImageFigureProps) {
  const resolvedSrc = toRenderableAttachmentUrl(src)

  if (!resolvedSrc) {
    return null
  }

  const display = parseMarkdownImageDisplay(title)

  return (
    <div className="my-3 max-w-full">
      <figure className={resolveFigureClassName(display)} style={resolveFigureStyle(display)}>
        <img
          src={resolvedSrc}
          alt={alt ?? ''}
          loading="lazy"
          className={resolveImageClassName(display)}
        />
      </figure>
    </div>
  )
}
