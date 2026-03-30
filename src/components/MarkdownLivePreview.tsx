import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
  Decoration,
  EditorView as CMEditorView,
  ViewPlugin,
  type PluginValue,
  WidgetType,
} from '@codemirror/view'
import {
  type Extension,
  type Range as CMRange,
  StateField,
} from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

import { changbu } from '../lib/changbu'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarkdownLivePreviewProps {
  value: string
  onValueChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
  placeholder?: string
  className?: string
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('图片读取失败。'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('图片读取失败。'))
    }
    reader.readAsDataURL(file)
  })
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

/* ------------------------------------------------------------------ */
/*  主题                                                               */
/* ------------------------------------------------------------------ */

const livePreviewTheme = CMEditorView.theme({
  '&': {
    fontSize: '14px',
    backgroundColor: '#faf8f5',
  },
  '.cm-content': {
    padding: '0',
    caretColor: '#292524',
    lineHeight: '1.75',
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
    backgroundColor: '#faf8f5',
  },
  '.cm-line': {
    padding: '0',
    fontFamily: 'inherit',
  },
  '.cm-placeholder': {
    color: '#a8a29e',
    fontStyle: 'italic',
    lineHeight: '1.75',
  },
  /* 行内样式 */
  '.cm-strong': {
    fontWeight: '700',
  },
  '.cm-em': {
    fontStyle: 'italic',
  },
  '.cm-inline-code': {
    backgroundColor: '#faf8f5',
    borderRadius: '3px',
    fontSize: '0.875em',
    padding: '1px 4px',
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  },
  '.cm-link-text': {
    color: '#2563eb',
    textDecoration: 'underline',
  },
  /* 标题：字号递减，仅标题用衬线字体 */
  '.cm-heading-1': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.75em',
    fontWeight: '700',
    lineHeight: '1.3',
    letterSpacing: '-0.01em',
  },
  '.cm-heading-2': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.45em',
    fontWeight: '700',
    lineHeight: '1.35',
    letterSpacing: '-0.01em',
  },
  '.cm-heading-3': {
    fontFamily: "'Newsreader', 'Noto Serif SC', Georgia, serif",
    fontSize: '1.2em',
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
  /* 代码块 - Decoration.line 会把 class 加到 .cm-line 上 */
  '.cm-line.cm-code-block': {
    backgroundColor: '#f5f5f4',
    borderRadius: '6px',
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
    fontSize: '0.875em',
    padding: '0 12px',
    lineHeight: '1.6',
  },
  /* 引用 */
  '.cm-blockquote': {
    borderLeft: '3px solid #d6d3d1',
    backgroundColor: '#faf8f5',
    paddingLeft: '12px',
    fontStyle: 'italic',
    color: '#57534e',
  },
  /* 分隔线 widget */
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

/* 隐藏子节点中的特定标记 */
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

/* Lezer SyntaxNode 的可遍历子集 */
interface SyntaxNodeLike {
  name: string
  from: number
  to: number
  firstChild: SyntaxNodeLike | null
  lastChild: SyntaxNodeLike | null
  nextSibling: SyntaxNodeLike | null
  parent: SyntaxNodeLike | null
}

class LivePreviewPlugin implements PluginValue {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view)
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view)
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const ranges: CMRange<Decoration>[] = []
    const cursorLine = view.state.field(cursorLineField)
    const doc = view.state.doc

    /* 收集代码块范围 */
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
        /* 跳过光标行 */
        if (isOnCursorLine(node.from, node.to)) return

        switch (node.name) {
          /* ---------- 标题标记 ---------- */
          case 'HeaderMark': {
            ranges.push(Decoration.replace({}).range(node.from, node.to))
            break
          }

          /* ---------- 标题行样式 ---------- */
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

          /* ---------- 粗体 ---------- */
          case 'StrongEmphasis': {
            ranges.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
            hideChildMarks(node.node, 'EmphasisMark', ranges)
            break
          }

          /* ---------- 斜体 ---------- */
          case 'Emphasis': {
            if (node.node.parent?.name === 'StrongEmphasis') break
            ranges.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
            hideChildMarks(node.node, 'EmphasisMark', ranges)
            break
          }

          /* ---------- 行内代码 ---------- */
          case 'InlineCode': {
            if (isInCodeBlock(node.from)) break
            ranges.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
            hideChildMarks(node.node, 'CodeMark', ranges)
            break
          }

          /* ---------- 链接 ---------- */
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

          /* ---------- 代码块 ---------- */
          case 'FencedCode': {
            /* 行级样式 */
            const startLine = doc.lineAt(node.from)
            const endLine = doc.lineAt(Math.min(node.to, doc.length))
            for (let ln = startLine.number; ln <= endLine.number; ln++) {
              const line = doc.line(ln)
              ranges.push(Decoration.line({ class: 'cm-code-block' }).range(line.from))
            }
            /* 隐藏围栏标记 */
            let child = node.node.firstChild
            while (child) {
              if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
                const lineEnd = doc.lineAt(child.from).to
                ranges.push(Decoration.replace({}).range(child.from, lineEnd))
              }
              child = child.nextSibling
            }
            /* 末尾 CodeMark */
            const lastChild = node.node.lastChild
            if (lastChild && lastChild.name === 'CodeMark' && lastChild !== node.node.firstChild) {
              ranges.push(Decoration.replace({}).range(lastChild.from, lastChild.to))
            }
            break
          }

          /* ---------- 引用 ---------- */
          case 'Blockquote': {
            const startLine = doc.lineAt(node.from)
            const endLine = doc.lineAt(Math.min(node.to, doc.length))
            for (let ln = startLine.number; ln <= endLine.number; ln++) {
              const line = doc.line(ln)
              ranges.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from))
            }
            /* 隐藏 > 标记 */
            let child = node.node.firstChild
            while (child) {
              if (child.name === 'QuoteMark') {
                ranges.push(Decoration.replace({}).range(child.from, child.to))
              }
              child = child.nextSibling
            }
            break
          }

          /* ---------- 分隔线 ---------- */
          case 'HorizontalRule': {
            ranges.push(Decoration.replace({
              widget: new HorizontalRuleWidget(),
            }).range(node.from, node.to))
            break
          }

          /* ---------- 列表标记 ---------- */
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

/* 分隔线 widget */
class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr-widget'
    return hr
  }
}

const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
})

/* ------------------------------------------------------------------ */
/*  图片粘贴扩展                                                       */
/* ------------------------------------------------------------------ */

function imagePasteExtension(onImageInsert: (markdown: string) => void): Extension {
  return CMEditorView.domEventHandlers({
    paste(event) {
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageFiles = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))

      if (imageFiles.length === 0) return

      event.preventDefault()

      void (async () => {
        for (const imageFile of imageFiles) {
          const dataUrl = await readFileAsDataUrl(imageFile)
          const saved = await changbu.attachments.saveImage(dataUrl, imageFile.name)
          onImageInsert(`\n\n![${saved.markdownAlt}](${saved.fileUrl})\n\n`)
        }
      })()
    },
  })
}

/* ------------------------------------------------------------------ */
/*  placeholder 扩展                                                   */
/* ------------------------------------------------------------------ */

class PlaceholderWidget extends WidgetType {
  private placeholderText: string

  constructor(text: string) {
    super()
    this.placeholderText = text
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

export function MarkdownLivePreview({
  value,
  onValueChange,
  onKeyDown,
  placeholder,
  className,
}: MarkdownLivePreviewProps) {
  const [isSavingImage, setIsSavingImage] = useState(false)
  const viewRef = { current: null as EditorView | null }

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      cursorLineField,
      livePreviewPlugin,
      livePreviewTheme,
      CMEditorView.lineWrapping,
      imagePasteExtension((md) => {
        const view = viewRef.current
        if (!view) return
        setIsSavingImage(true)
        try {
          const cursor = view.state.selection.main.head
          view.dispatch({
            changes: { from: cursor, insert: md },
            selection: { anchor: cursor + md.length },
          })
        } finally {
          setIsSavingImage(false)
        }
      }),
    ]

    if (placeholder) {
      exts.push(placeholderExtension(placeholder))
    }

    return exts
  // eslint-disable-next-line react-hooks/exhaustive-deps -- viewRef 不需要作为依赖
  }, [placeholder])

  return (
    <div className={`min-w-0 flex-1 ${className ?? ''}`}>
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
      {isSavingImage ? (
        <p className="mt-1 text-xs text-stone-500">图片保存中，马上会插入 Markdown 链接…</p>
      ) : null}
    </div>
  )
}
