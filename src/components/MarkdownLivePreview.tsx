import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
  Decoration,
  EditorView as CMEditorView,
  ViewPlugin,
  type PluginValue,
  WidgetType,
  drawSelection,
} from '@codemirror/view'
import {
  type Extension,
  type Range as CMRange,
  StateEffect,
  StateField,
} from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

import { toRenderableAttachmentUrl } from '../lib/attachmentUrl'
import { extractImageFiles, hasPotentialImageTransfer } from '../lib/imageTransfer'
import {
  buildMarkdownImageSnippet,
  saveMarkdownImageFiles,
} from '../lib/markdownImageUpload'
import {
  MARKDOWN_IMAGE_PRESET_WIDTHS,
  normalizeMarkdownImageWidth,
  parseMarkdownImage,
  type MarkdownImageDisplay,
  resolveMarkdownImageDisplayFromWidth,
  setMarkdownImageDisplay,
} from '../lib/markdownImage'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarkdownLivePreviewProps {
  value: string
  onValueChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
  placeholder?: string
  className?: string
  dropTarget?: 'self' | 'none'
}

export type MarkdownFormatAction = 'heading' | 'bold' | 'italic' | 'codeBlock' | 'bulletList' | 'orderedList'

export interface MarkdownLivePreviewHandle {
  insertImageFiles: (imageFiles: File[], dropPoint?: { clientX: number; clientY: number }) => void
  applyMarkdownFormat: (action: MarkdownFormatAction) => void
}

interface ImageSourceRange {
  from: number
  to: number
}

interface ImageFeedback {
  kind: 'error' | 'info'
  text: string
}

interface ImageContextMenuItem {
  label: string
  onSelect: () => void | Promise<void>
  danger?: boolean
}

type ReportImageFeedback = (feedback: ImageFeedback | null) => void

interface MarkdownEditOperation {
  from: number
  to: number
  insert: string
  selection: {
    anchor: number
    head: number
  }
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isSameImageRange(left: ImageSourceRange | null, right: ImageSourceRange | null): boolean {
  return left?.from === right?.from && left?.to === right?.to
}

function resolveEditorAvailableWidth(view: EditorView): number {
  return Math.max(120, view.scrollDOM.clientWidth - 24)
}

function buildWrappedSelectionEdit(
  view: EditorView,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownEditOperation {
  const selection = view.state.selection.main
  const selectedText = view.state.doc.sliceString(selection.from, selection.to)
  const content = selectedText || placeholder
  const insert = `${prefix}${content}${suffix}`
  const contentStart = selection.from + prefix.length

  return {
    from: selection.from,
    to: selection.to,
    insert,
    selection: {
      anchor: contentStart,
      head: contentStart + content.length,
    },
  }
}

function buildCodeBlockEdit(view: EditorView): MarkdownEditOperation {
  const selection = view.state.selection.main
  const selectedText = view.state.doc.sliceString(selection.from, selection.to)
  const content = selectedText || '代码'
  const insert = `\`\`\`\n${content}\n\`\`\``
  const contentStart = selection.from + 4

  return {
    from: selection.from,
    to: selection.to,
    insert,
    selection: {
      anchor: contentStart,
      head: contentStart + content.length,
    },
  }
}

function buildPrefixedLinesEdit(
  view: EditorView,
  formatter: (lineText: string, index: number) => { text: string; cursorOffset?: number },
): MarkdownEditOperation {
  const selection = view.state.selection.main
  const startLine = view.state.doc.lineAt(selection.from)
  const endPos = selection.empty ? selection.to : Math.max(selection.to - 1, selection.from)
  const endLine = view.state.doc.lineAt(endPos)
  const lines: string[] = []
  let cursorOffset = 0

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)
    const formatted = formatter(line.text, lineNumber - startLine.number)
    if (selection.empty && lineNumber === startLine.number) {
      cursorOffset = formatted.cursorOffset ?? 0
    }
    lines.push(formatted.text)
  }

  const insert = lines.join('\n')

  return {
    from: startLine.from,
    to: endLine.to,
    insert,
    selection: selection.empty
      ? {
          anchor: startLine.from + cursorOffset,
          head: startLine.from + cursorOffset,
        }
      : {
          anchor: startLine.from,
          head: startLine.from + insert.length,
        },
  }
}

function buildMarkdownFormatEdit(view: EditorView, action: MarkdownFormatAction): MarkdownEditOperation {
  switch (action) {
    case 'heading':
      return buildPrefixedLinesEdit(view, (lineText) => {
        const text = `# ${lineText}`
        return {
          text,
          cursorOffset: lineText ? 2 + lineText.length : 2,
        }
      })
    case 'bold':
      return buildWrappedSelectionEdit(view, '**', '**', '加粗文本')
    case 'italic':
      return buildWrappedSelectionEdit(view, '*', '*', '斜体文本')
    case 'codeBlock':
      return buildCodeBlockEdit(view)
    case 'bulletList':
      return buildPrefixedLinesEdit(view, (lineText) => ({
        text: `- ${lineText}`,
        cursorOffset: lineText ? 2 + lineText.length : 2,
      }))
    case 'orderedList':
      return buildPrefixedLinesEdit(view, (lineText, index) => {
        const prefix = `${index + 1}. `
        return {
          text: `${prefix}${lineText}`,
          cursorOffset: lineText ? prefix.length + lineText.length : prefix.length,
        }
      })
  }
}

let activeImageContextMenu: HTMLDivElement | null = null
let clearActiveImageContextMenuListeners: (() => void) | null = null

function closeActiveImageContextMenu(): void {
  clearActiveImageContextMenuListeners?.()
  clearActiveImageContextMenuListeners = null
  activeImageContextMenu?.remove()
  activeImageContextMenu = null
}

function openImageContextMenu(x: number, y: number, items: ImageContextMenuItem[]): void {
  closeActiveImageContextMenu()

  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  Object.assign(menu.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    minWidth: '168px',
    padding: '6px',
    borderRadius: '12px',
    border: '1px solid rgba(231, 229, 228, 0.96)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    boxShadow: '0 18px 38px rgba(28, 25, 23, 0.16)',
    backdropFilter: 'blur(12px)',
    zIndex: '9999',
  } satisfies Partial<CSSStyleDeclaration>)

  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.textContent = item.label
    Object.assign(button.style, {
      display: 'block',
      width: '100%',
      border: 'none',
      borderRadius: '8px',
      padding: '8px 10px',
      backgroundColor: 'transparent',
      color: item.danger ? '#b91c1c' : '#1c1917',
      fontSize: '12px',
      lineHeight: '1.2',
      textAlign: 'left',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>)

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = item.danger ? 'rgba(254, 226, 226, 0.7)' : '#f5f5f4'
    })
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'transparent'
    })
    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeActiveImageContextMenu()
      await item.onSelect()
    })

    menu.appendChild(button)
  }

  document.body.appendChild(menu)

  const rect = menu.getBoundingClientRect()
  const boundedX = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
  const boundedY = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
  menu.style.left = `${boundedX}px`
  menu.style.top = `${boundedY}px`

  const handlePointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && menu.contains(event.target)) {
      return
    }
    closeActiveImageContextMenu()
  }

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeActiveImageContextMenu()
    }
  }

  const cleanup = () => {
    window.removeEventListener('pointerdown', handlePointerDown, true)
    window.removeEventListener('resize', closeActiveImageContextMenu)
    window.removeEventListener('blur', closeActiveImageContextMenu)
    document.removeEventListener('keydown', handleEscape, true)
  }

  clearActiveImageContextMenuListeners = cleanup
  activeImageContextMenu = menu

  window.addEventListener('pointerdown', handlePointerDown, true)
  window.addEventListener('resize', closeActiveImageContextMenu)
  window.addEventListener('blur', closeActiveImageContextMenu)
  document.addEventListener('keydown', handleEscape, true)
}

/* ------------------------------------------------------------------ */
/*  光标行号追踪                                                       */
/* ------------------------------------------------------------------ */

const cursorLineField = StateField.define<number>({
  create(state) {
    return state.doc.lineAt(state.selection.main.head).number
  },
  update(value, tr) {
    if (!tr.selection) return value
    return tr.state.doc.lineAt(tr.state.selection.main.head).number
  },
})

const revealImageSourceEffect = StateEffect.define<ImageSourceRange | null>()
const selectImageEffect = StateEffect.define<ImageSourceRange | null>()

const imageSourceField = StateField.define<ImageSourceRange | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value

    if (nextValue) {
      nextValue = {
        from: tr.changes.mapPos(nextValue.from),
        to: tr.changes.mapPos(nextValue.to, 1),
      }

      if (nextValue.from >= nextValue.to) {
        nextValue = null
      }
    }

    for (const effect of tr.effects) {
      if (effect.is(revealImageSourceEffect)) {
        nextValue = effect.value
      }
    }

    if (!nextValue) {
      return null
    }

    const selection = tr.state.selection.main
    const isInsideSourceRange = selection.from >= nextValue.from && selection.to <= nextValue.to

    return isInsideSourceRange ? nextValue : null
  },
})

const selectedImageField = StateField.define<ImageSourceRange | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value

    if (nextValue) {
      nextValue = {
        from: tr.changes.mapPos(nextValue.from),
        to: tr.changes.mapPos(nextValue.to, 1),
      }

      if (nextValue.from >= nextValue.to) {
        nextValue = null
      }
    }

    for (const effect of tr.effects) {
      if (effect.is(selectImageEffect)) {
        nextValue = effect.value
      }
    }

    return nextValue
  },
})

/* ------------------------------------------------------------------ */
/*  主题                                                               */
/* ------------------------------------------------------------------ */

const livePreviewTheme = CMEditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    padding: '0',
    caretColor: '#292524',
    lineHeight: '1.55',
    color: '#1c1917',
  },
  '.cm-cursor': {
    borderLeftColor: '#292524',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '&.cm-focused': {
    outline: 'none !important',
  },
  '.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    background: 'rgba(24, 24, 27, 0.12) !important',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
  },
  '.cm-line': {
    padding: '0',
    fontFamily: 'inherit',
  },
  '.cm-placeholder': {
    color: '#a8a29e',
    fontStyle: 'italic',
    lineHeight: '1.55',
  },
  '.cm-strong': {
    fontWeight: '700',
  },
  '.cm-em': {
    fontStyle: 'italic',
  },
  '.cm-inline-code': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: '3px',
    fontSize: '0.82em',
    padding: '1px 4px',
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  },
  '.cm-link-text': {
    color: '#2563eb',
    textDecoration: 'underline',
  },
  '.cm-image-widget': {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    maxWidth: '100%',
    margin: '10px 0 18px',
    verticalAlign: 'top',
    boxSizing: 'border-box',
  },
  '.cm-image-widget-frame': {
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #e7e5e4',
    backgroundColor: '#fafaf9',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  '.cm-image-widget-selected .cm-image-widget-frame': {
    borderColor: '#a8a29e',
    boxShadow: '0 0 0 3px rgba(120, 113, 108, 0.14)',
  },
  '.cm-image-widget img': {
    display: 'block',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '560px',
    objectFit: 'contain',
    backgroundColor: '#f5f5f4',
  },
  '.cm-image-widget-resize-handle': {
    position: 'absolute',
    right: '-6px',
    bottom: '-6px',
    width: '14px',
    height: '14px',
    borderRadius: '999px',
    border: '2px solid #fafaf9',
    backgroundColor: '#292524',
    boxShadow: '0 4px 12px rgba(28, 25, 23, 0.18)',
    opacity: '0',
    pointerEvents: 'none',
    cursor: 'nwse-resize',
  },
  '.cm-image-widget-selected .cm-image-widget-resize-handle': {
    opacity: '1',
    pointerEvents: 'auto',
  },
  '.cm-heading-1': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.5em',
    fontWeight: '700',
    lineHeight: '1.3',
    letterSpacing: '-0.01em',
  },
  '.cm-heading-2': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.3em',
    fontWeight: '700',
    lineHeight: '1.35',
  },
  '.cm-heading-3': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.1em',
    fontWeight: '600',
    lineHeight: '1.4',
  },
  '.cm-heading-4': {
    fontSize: '1.05em',
    fontWeight: '600',
    lineHeight: '1.5',
  },
  '.cm-heading-5': {
    fontSize: '1em',
    fontWeight: '600',
    lineHeight: '1.5',
  },
  '.cm-heading-6': {
    fontSize: '0.95em',
    fontWeight: '600',
    lineHeight: '1.5',
    color: '#57534e',
  },
  '.cm-line.cm-code-block': {
    backgroundColor: '#f5f5f4',
    borderRadius: '6px',
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
    fontSize: '0.82em',
    padding: '0 12px',
    lineHeight: '1.6',
  },
  '.cm-blockquote': {
    borderLeft: '3px solid #d6d3d1',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    paddingLeft: '12px',
    fontStyle: 'italic',
    color: '#57534e',
  },
  '.cm-hr-widget': {
    display: 'block',
    border: 'none',
    borderTop: '1px solid #d6d3d1',
    margin: '8px 0',
    height: '0',
  },
})

/* ------------------------------------------------------------------ */
/*  装饰插件                                                           */
/* ------------------------------------------------------------------ */

function hideChildMarks(
  parentNode: { firstChild: SyntaxNodeLike | null },
  markName: string,
  out: CMRange<Decoration>[],
): void {
  let child: SyntaxNodeLike | null = parentNode.firstChild
  while (child) {
    if (child.name === markName) {
      out.push(Decoration.replace({}).range(child.from, child.to))
    }
    child = child.nextSibling
  }
}

interface SyntaxNodeLike {
  name: string
  from: number
  to: number
  firstChild: SyntaxNodeLike | null
  lastChild: SyntaxNodeLike | null
  nextSibling: SyntaxNodeLike | null
  parent: SyntaxNodeLike | null
}

function applyPreviewWidth(wrapper: HTMLElement, image: HTMLImageElement, width: number, availableWidth: number): void {
  wrapper.style.width = `${Math.min(width, availableWidth)}px`
  image.style.width = '100%'
}

function createLivePreviewPlugin(reportImageFeedback: ReportImageFeedback): Extension {
  class LivePreviewPlugin implements PluginValue {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        closeActiveImageContextMenu()
        this.decorations = this.buildDecorations(update.view)
        return
      }

      const previousImageSource = update.startState.field(imageSourceField)
      const nextImageSource = update.state.field(imageSourceField)
      if (!isSameImageRange(previousImageSource, nextImageSource)) {
        this.decorations = this.buildDecorations(update.view)
        return
      }

      const previousSelectedImage = update.startState.field(selectedImageField)
      const nextSelectedImage = update.state.field(selectedImageField)
      if (!isSameImageRange(previousSelectedImage, nextSelectedImage)) {
        this.decorations = this.buildDecorations(update.view)
        return
      }

      if (!update.selectionSet) {
        return
      }

      const previousCursorLine = update.startState.field(cursorLineField)
      const nextCursorLine = update.state.field(cursorLineField)

      if (previousCursorLine !== nextCursorLine) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    private buildDecorations(view: EditorView): DecorationSet {
      const ranges: CMRange<Decoration>[] = []
      const cursorLine = view.state.field(cursorLineField)
      const revealedImageSource = view.state.field(imageSourceField)
      const selectedImage = view.state.field(selectedImageField)
      const doc = view.state.doc

      const codeBlockRanges: Array<{ from: number; to: number }> = []
      syntaxTree(view.state).iterate({
        enter(node) {
          if (node.name === 'FencedCode') {
            codeBlockRanges.push({ from: node.from, to: node.to })
          }
        },
      })

      const isInCodeBlock = (pos: number): boolean => {
        for (const range of codeBlockRanges) {
          if (pos >= range.from && pos <= range.to) return true
        }
        return false
      }

      const isOnCursorLine = (from: number, to: number): boolean => {
        const nodeStartLine = doc.lineAt(from).number
        const nodeEndLine = doc.lineAt(Math.min(to, doc.length)).number
        return cursorLine >= nodeStartLine && cursorLine <= nodeEndLine
      }

      syntaxTree(view.state).iterate({
        enter(node) {
          if (node.name === 'Image') {
            if (revealedImageSource && node.from === revealedImageSource.from && node.to === revealedImageSource.to) {
              return
            }

            const parsed = parseMarkdownImage(doc.sliceString(node.from, node.to))

            if (!parsed) {
              return
            }

            ranges.push(
              Decoration.replace({
                widget: new MarkdownImageWidget(
                  doc.sliceString(node.from, node.to),
                  parsed.src,
                  parsed.alt,
                  parsed.display,
                  node.from,
                  node.to,
                  Boolean(selectedImage && selectedImage.from === node.from && selectedImage.to === node.to),
                  reportImageFeedback,
                ),
              }).range(node.from, node.to),
            )
            return
          }

          if (isOnCursorLine(node.from, node.to)) return

          switch (node.name) {
            case 'HeaderMark': {
              ranges.push(Decoration.replace({}).range(node.from, node.to))
              break
            }

            case 'ATXHeading1':
            case 'ATXHeading2':
            case 'ATXHeading3':
            case 'ATXHeading4':
            case 'ATXHeading5':
            case 'ATXHeading6': {
              const level = Number(node.name.slice(-1))
              const lineStart = doc.lineAt(node.from).from
              ranges.push(Decoration.line({ class: `cm-heading-${level}` }).range(lineStart))
              break
            }

            case 'StrongEmphasis': {
              ranges.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
              hideChildMarks(node.node, 'EmphasisMark', ranges)
              break
            }

            case 'Emphasis': {
              if (node.node.parent?.name === 'StrongEmphasis') break
              ranges.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
              hideChildMarks(node.node, 'EmphasisMark', ranges)
              break
            }

            case 'InlineCode': {
              if (isInCodeBlock(node.from)) break
              ranges.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
              hideChildMarks(node.node, 'CodeMark', ranges)
              break
            }

            case 'Link': {
              let child = node.node.firstChild
              while (child) {
                if (child.name === 'LinkMark') {
                  ranges.push(Decoration.replace({}).range(child.from, child.to))
                }
                if (child.name === 'URL') {
                  const prevChar = doc.sliceString(child.from - 1, child.from)
                  if (prevChar === '(') {
                    ranges.push(Decoration.replace({}).range(child.from - 1, child.to + 1))
                  } else {
                    ranges.push(Decoration.replace({}).range(child.from, child.to))
                  }
                }
                child = child.nextSibling
              }
              ranges.push(Decoration.mark({ class: 'cm-link-text' }).range(node.from, node.to))
              break
            }

            case 'FencedCode': {
              const startLine = doc.lineAt(node.from)
              const endLine = doc.lineAt(Math.min(node.to, doc.length))
              for (let ln = startLine.number; ln <= endLine.number; ln++) {
                const line = doc.line(ln)
                ranges.push(Decoration.line({ class: 'cm-code-block' }).range(line.from))
              }
              let child = node.node.firstChild
              while (child) {
                if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
                  const lineEnd = doc.lineAt(child.from).to
                  ranges.push(Decoration.replace({}).range(child.from, lineEnd))
                }
                child = child.nextSibling
              }
              const lastChild = node.node.lastChild
              if (lastChild && lastChild.name === 'CodeMark' && lastChild !== node.node.firstChild) {
                ranges.push(Decoration.replace({}).range(lastChild.from, lastChild.to))
              }
              break
            }

            case 'Blockquote': {
              const startLine = doc.lineAt(node.from)
              const endLine = doc.lineAt(Math.min(node.to, doc.length))
              for (let ln = startLine.number; ln <= endLine.number; ln++) {
                const line = doc.line(ln)
                ranges.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from))
              }
              let child = node.node.firstChild
              while (child) {
                if (child.name === 'QuoteMark') {
                  ranges.push(Decoration.replace({}).range(child.from, child.to))
                }
                child = child.nextSibling
              }
              break
            }

            case 'HorizontalRule': {
              ranges.push(Decoration.replace({
                widget: new HorizontalRuleWidget(),
              }).range(node.from, node.to))
              break
            }

            case 'ListMark': {
              ranges.push(Decoration.replace({}).range(node.from, node.to))
              break
            }
          }
        },
      })

      return Decoration.set(ranges, true)
    }
  }

  return ViewPlugin.fromClass(LivePreviewPlugin, {
    decorations: (value) => value.decorations,
  })
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr-widget'
    return hr
  }
}

class MarkdownImageWidget extends WidgetType {
  private readonly markdown: string
  private readonly src: string
  private readonly alt: string
  private readonly display: MarkdownImageDisplay
  private readonly from: number
  private readonly to: number
  private readonly selected: boolean
  private readonly reportImageFeedback: ReportImageFeedback

  constructor(
    markdown: string,
    src: string,
    alt: string,
    display: MarkdownImageDisplay,
    from: number,
    to: number,
    selected: boolean,
    reportImageFeedback: ReportImageFeedback,
  ) {
    super()
    this.markdown = markdown
    this.src = src
    this.alt = alt
    this.display = display
    this.from = from
    this.to = to
    this.selected = selected
    this.reportImageFeedback = reportImageFeedback
  }

  eq(other: MarkdownImageWidget): boolean {
    return other.src === this.src
      && other.alt === this.alt
      && other.markdown === this.markdown
      && other.from === this.from
      && other.to === this.to
      && other.selected === this.selected
  }

  ignoreEvent(): boolean {
    return false
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = `cm-image-widget${this.selected ? ' cm-image-widget-selected' : ''}`
    wrapper.dataset.imageFrom = String(this.from)
    wrapper.dataset.imageTo = String(this.to)
    this.applyDisplay(wrapper)

    wrapper.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeActiveImageContextMenu()
      view.dispatch({
        effects: selectImageEffect.of({
          from: this.from,
          to: this.to,
        }),
      })
      view.focus()
    })

    wrapper.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeActiveImageContextMenu()
      view.dispatch({
        effects: selectImageEffect.of({
          from: this.from,
          to: this.to,
        }),
      })
      view.focus()

      requestAnimationFrame(() => {
        openImageContextMenu(event.clientX, event.clientY, [
          {
            label: '复制图片',
            onSelect: async () => {
              await this.copyImage()
            },
          },
          {
            label: '删除图片',
            danger: true,
            onSelect: () => this.removeImage(view),
          },
          {
            label: '复制图片地址',
            onSelect: async () => {
              await this.copyImageSource()
            },
          },
          {
            label: '查看源码',
            onSelect: () => this.revealSource(view),
          },
          {
            label: '重置宽度',
            onSelect: () => this.resetDisplay(view),
          },
        ])
      })
    })

    const frame = document.createElement('span')
    frame.className = 'cm-image-widget-frame'
    wrapper.appendChild(frame)

    const image = document.createElement('img')
    image.src = toRenderableAttachmentUrl(this.src)
    image.alt = this.alt
    image.loading = 'lazy'
    image.draggable = false
    if (this.display.kind !== 'auto') {
      image.style.width = '100%'
    }
    frame.appendChild(image)

    wrapper.appendChild(this.createResizeHandle(view, wrapper, image))

    return wrapper
  }

  private dispatchUpdatedMarkdown(view: EditorView, nextMarkdown: string | null): void {
    if (!nextMarkdown) {
      return
    }

    closeActiveImageContextMenu()
    view.dispatch({
      changes: {
        from: this.from,
        to: this.to,
        insert: nextMarkdown,
      },
      effects: selectImageEffect.of({
        from: this.from,
        to: this.from + nextMarkdown.length,
      }),
    })
    view.focus()
  }

  private applyDisplay(wrapper: HTMLElement): void {
    wrapper.style.width = ''

    if (this.display.kind === 'width') {
      wrapper.style.width = `${this.display.width}px`
      return
    }

    if (this.display.kind === 'preset') {
      wrapper.style.width = this.display.preset === 'full'
        ? '100%'
        : `${MARKDOWN_IMAGE_PRESET_WIDTHS[this.display.preset]}px`
    }
  }

  private createResizeHandle(view: EditorView, wrapper: HTMLElement, image: HTMLImageElement): HTMLElement {
    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = 'cm-image-widget-resize-handle'
    handle.setAttribute('aria-label', '调整图片宽度')

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeActiveImageContextMenu()

      const availableWidth = resolveEditorAvailableWidth(view)
      const startWidth = wrapper.getBoundingClientRect().width || availableWidth
      const startX = event.clientX
      const previousUserSelect = document.body.style.userSelect

      document.body.style.userSelect = 'none'
      wrapper.classList.add('cm-image-widget-selected')
      view.dispatch({
        effects: selectImageEffect.of({
          from: this.from,
          to: this.to,
        }),
      })

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = normalizeMarkdownImageWidth(startWidth + moveEvent.clientX - startX)
        applyPreviewWidth(wrapper, image, nextWidth, availableWidth)
      }

      const handlePointerUp = (upEvent: PointerEvent) => {
        const nextWidth = normalizeMarkdownImageWidth(startWidth + upEvent.clientX - startX)
        const nextDisplay = resolveMarkdownImageDisplayFromWidth(nextWidth, availableWidth)
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        this.dispatchUpdatedMarkdown(view, setMarkdownImageDisplay(this.markdown, nextDisplay))
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp, { once: true })
    })

    return handle
  }

  private revealSource(view: EditorView): void {
    closeActiveImageContextMenu()
    view.dispatch({
      effects: [
        revealImageSourceEffect.of({
          from: this.from,
          to: this.to,
        }),
        selectImageEffect.of(null),
      ],
      selection: {
        anchor: this.from,
        head: this.to,
      },
    })
    view.focus()
  }

  private removeImage(view: EditorView): void {
    closeActiveImageContextMenu()
    view.dispatch({
      changes: {
        from: this.from,
        to: this.to,
        insert: '',
      },
      effects: selectImageEffect.of(null),
    })
    view.focus()
  }

  private async copyImageSource(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板复制。')
      }

      await navigator.clipboard.writeText(this.src)
      this.reportImageFeedback({
        kind: 'info',
        text: '图片地址已复制。',
      })
    } catch (error) {
      this.reportImageFeedback({
        kind: 'error',
        text: toErrorMessage(error, '图片地址复制失败。'),
      })
    }
  }

  private async copyImage(): Promise<void> {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('当前环境不支持复制图片。')
      }

      const response = await fetch(toRenderableAttachmentUrl(this.src))
      if (!response.ok) {
        throw new Error('图片读取失败。')
      }

      const blob = await response.blob()
      const clipboardItem = new ClipboardItem({
        [blob.type || 'image/png']: blob,
      })
      await navigator.clipboard.write([clipboardItem])

      this.reportImageFeedback({
        kind: 'info',
        text: '图片已复制。',
      })
    } catch (error) {
      this.reportImageFeedback({
        kind: 'error',
        text: toErrorMessage(error, '图片复制失败。'),
      })
    }
  }

  private resetDisplay(view: EditorView): void {
    this.dispatchUpdatedMarkdown(view, setMarkdownImageDisplay(this.markdown, { kind: 'auto' }))
  }
}

/* ------------------------------------------------------------------ */
/*  图片粘贴扩展                                                       */
/* ------------------------------------------------------------------ */

async function saveAndInsertImages(
  view: EditorView,
  imageFiles: File[],
  position: number,
  reportImageFeedback: ReportImageFeedback,
): Promise<void> {
  let insertPosition = position

  try {
    const savedImages = await saveMarkdownImageFiles(imageFiles)

    for (const savedImage of savedImages) {
      const snippet = buildMarkdownImageSnippet(savedImage, insertPosition > 0)

      view.dispatch({
        changes: { from: insertPosition, insert: snippet },
        selection: { anchor: insertPosition + snippet.length },
      })

      insertPosition += snippet.length
    }

    view.focus()
  } catch (error) {
    reportImageFeedback({
      kind: 'error',
      text: toErrorMessage(error, '图片保存失败。'),
    })
  }
}

function imageTransferExtension(reportImageFeedback: ReportImageFeedback): Extension {
  return CMEditorView.domEventHandlers({
    paste(event, view) {
      const imageFiles = extractImageFiles(event.clipboardData)

      if (imageFiles.length === 0) {
        return false
      }

      event.preventDefault()
      void saveAndInsertImages(view, imageFiles, view.state.selection.main.head, reportImageFeedback)
      return true
    },

    mousedown(event, view) {
      if (event.target instanceof HTMLElement && event.target.closest('.cm-image-widget')) {
        return false
      }

      closeActiveImageContextMenu()

      if (view.state.field(selectedImageField)) {
        view.dispatch({
          effects: selectImageEffect.of(null),
        })
      }

      return false
    },

    keydown(event, view) {
      if (event.key !== 'Escape' || !view.state.field(selectedImageField)) {
        return false
      }

      closeActiveImageContextMenu()
      event.preventDefault()
      view.dispatch({
        effects: selectImageEffect.of(null),
      })
      return true
    },
  })
}

/* ------------------------------------------------------------------ */
/*  placeholder 扩展                                                   */
/* ------------------------------------------------------------------ */

class PlaceholderWidget extends WidgetType {
  private readonly placeholderText: string

  constructor(placeholderText: string) {
    super()
    this.placeholderText = placeholderText
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.textContent = this.placeholderText
    span.className = 'cm-placeholder'
    return span
  }
}

function placeholderExtension(text: string): Extension {
  return CMEditorView.decorations.compute(['doc'], (state) => {
    if (state.doc.length > 0) return Decoration.none
    return Decoration.set([
      Decoration.widget({
        widget: new PlaceholderWidget(text),
        side: 1,
      }).range(0),
    ])
  })
}

/* ------------------------------------------------------------------ */
/*  React 组件                                                         */
/* ------------------------------------------------------------------ */

export const MarkdownLivePreview = forwardRef<MarkdownLivePreviewHandle, MarkdownLivePreviewProps>(function MarkdownLivePreview({
  value,
  onValueChange,
  onKeyDown,
  placeholder,
  className,
  dropTarget = 'self',
}: MarkdownLivePreviewProps, ref) {
  const viewRef = useRef<EditorView | null>(null)
  const dragDepthRef = useRef(0)
  const [imageFeedback, setImageFeedback] = useState<ImageFeedback | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reportImageFeedback = useMemo<ReportImageFeedback>(() => (feedback) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = null
    }

    setImageFeedback(feedback)

    if (!feedback) {
      return
    }

    feedbackTimerRef.current = setTimeout(() => {
      setImageFeedback(null)
      feedbackTimerRef.current = null
    }, 2600)
  }, [])

  useEffect(() => {
    return () => {
      dragDepthRef.current = 0
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
      closeActiveImageContextMenu()
    }
  }, [])

  const insertImageFiles = useCallback((imageFiles: File[], dropPoint?: { clientX: number; clientY: number }) => {
    const view = viewRef.current

    if (!view) {
      reportImageFeedback({
        kind: 'error',
        text: '编辑器尚未准备好，暂时无法插入图片。',
      })
      return
    }

    const position = dropPoint
      ? (view.posAtCoords({ x: dropPoint.clientX, y: dropPoint.clientY }) ?? view.state.selection.main.head)
      : view.state.selection.main.head

    void saveAndInsertImages(view, imageFiles, position, reportImageFeedback)
  }, [reportImageFeedback])

  const applyMarkdownFormat = useCallback((action: MarkdownFormatAction) => {
    const view = viewRef.current

    if (!view) {
      return
    }

    const operation = buildMarkdownFormatEdit(view, action)

    closeActiveImageContextMenu()
    view.dispatch({
      changes: {
        from: operation.from,
        to: operation.to,
        insert: operation.insert,
      },
      selection: operation.selection,
      effects: selectImageEffect.of(null),
    })
    view.focus()
  }, [])

  useImperativeHandle(ref, () => ({
    insertImageFiles,
    applyMarkdownFormat,
  }), [applyMarkdownFormat, insertImageFiles])

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      markdown({ base: markdownLanguage }),
      drawSelection(),
      cursorLineField,
      imageSourceField,
      selectedImageField,
      createLivePreviewPlugin(reportImageFeedback),
      livePreviewTheme,
      CMEditorView.lineWrapping,
      imageTransferExtension(reportImageFeedback),
    ]

    if (placeholder) {
      exts.push(placeholderExtension(placeholder))
    }

    return exts
  }, [placeholder, reportImageFeedback])

  const enableSelfDropTarget = dropTarget === 'self'

  return (
    <div
      className={`min-h-0 min-w-0 flex-1 rounded-lg transition-colors ${enableSelfDropTarget && isDragActive ? 'bg-stone-50/80 ring-2 ring-stone-300 ring-inset' : ''} ${className ?? ''}`}
      onDragEnter={enableSelfDropTarget ? (event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current += 1
        setIsDragActive(true)
      } : undefined}
      onDragOver={enableSelfDropTarget ? (event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        if (!isDragActive) {
          setIsDragActive(true)
        }
      } : undefined}
      onDragLeave={enableSelfDropTarget ? (event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) {
          setIsDragActive(false)
        }
      } : undefined}
      onDrop={enableSelfDropTarget ? (event) => {
        const imageFiles = extractImageFiles(event.dataTransfer)
        dragDepthRef.current = 0
        setIsDragActive(false)

        if (imageFiles.length === 0) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        insertImageFiles(imageFiles, { clientX: event.clientX, clientY: event.clientY })
      } : undefined}
    >
      <CodeMirror
        value={value}
        onChange={onValueChange}
        extensions={extensions}
        basicSetup={false}
        onCreateEditor={(view) => {
          viewRef.current = view
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event.nativeEvent)
        }}
      />
      {imageFeedback ? (
        <p className={`mt-2 text-xs ${imageFeedback.kind === 'error' ? 'text-red-600' : 'text-stone-500'}`}>
          {imageFeedback.text}
        </p>
      ) : enableSelfDropTarget && isDragActive ? (
        <p className="mt-2 text-xs text-stone-500">拖放图片即可插入。</p>
      ) : null}
    </div>
  )
})
