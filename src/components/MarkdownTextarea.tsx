import { type KeyboardEventHandler, type TextareaHTMLAttributes, useRef, useState } from 'react'

import { extractImageFiles, hasPotentialImageTransfer } from '../lib/imageTransfer'
import { buildMarkdownImageSnippet, saveMarkdownImageFiles } from '../lib/markdownImageUpload'

interface MarkdownTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}

function insertAtSelection(content: string, selectionStart: number, selectionEnd: number, snippet: string) {
  const before = content.slice(0, selectionStart)
  const after = content.slice(selectionEnd)
  const nextValue = `${before}${snippet}${after}`
  const nextCursor = before.length + snippet.length

  return {
    nextValue,
    nextCursor,
  }
}

export function MarkdownTextarea({ value, onValueChange, onKeyDown, className, ...props }: MarkdownTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragDepthRef = useRef(0)
  const [isSavingImage, setIsSavingImage] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)

  async function insertImages(textarea: HTMLTextAreaElement, imageFiles: File[]) {
    let currentValue = value
    let selectionStart = textarea.selectionStart
    let selectionEnd = textarea.selectionEnd
    setIsSavingImage(true)

    try {
      const savedImages = await saveMarkdownImageFiles(imageFiles)

      for (const savedImage of savedImages) {
        const snippet = buildMarkdownImageSnippet(savedImage, selectionStart > 0)
        const inserted = insertAtSelection(currentValue, selectionStart, selectionEnd, snippet)
        currentValue = inserted.nextValue
        selectionStart = inserted.nextCursor
        selectionEnd = inserted.nextCursor
      }

      onValueChange(currentValue)

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.selectionStart = selectionStart
          textareaRef.current.selectionEnd = selectionEnd
        }
      })
    } finally {
      setIsSavingImage(false)
    }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = extractImageFiles(event.clipboardData)

    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    await insertImages(event.currentTarget, imageFiles)
  }

  return (
    <div
      className={`min-w-0 flex-1 space-y-2 rounded-lg transition-colors ${isDragActive ? 'bg-stone-50/80 ring-2 ring-stone-300 ring-inset' : ''}`}
      onDragEnter={(event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current += 1
        setIsDragActive(true)
      }}
      onDragOver={(event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        if (!isDragActive) {
          setIsDragActive(true)
        }
      }}
      onDragLeave={(event) => {
        if (!hasPotentialImageTransfer(event.dataTransfer)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) {
          setIsDragActive(false)
        }
      }}
      onDrop={(event) => {
        const imageFiles = extractImageFiles(event.dataTransfer)
        dragDepthRef.current = 0
        setIsDragActive(false)

        if (imageFiles.length === 0 || !textareaRef.current) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void insertImages(textareaRef.current, imageFiles)
      }}
    >
      <textarea
        {...props}
        className={`w-full ${className ?? ''}`}
        ref={textareaRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          void handlePaste(event)
        }}
      />
      {isSavingImage ? <p className="text-xs text-stone-500">图片保存中，马上会插入 Markdown 链接…</p> : isDragActive ? <p className="text-xs text-stone-500">拖放图片即可插入。</p> : null}
    </div>
  )
}
