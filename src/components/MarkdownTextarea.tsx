import { type KeyboardEventHandler, type TextareaHTMLAttributes, useRef, useState } from 'react'

import { changbu } from '../lib/changbu'

interface MarkdownTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}

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
  const [isSavingImage, setIsSavingImage] = useState(false)

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    const textarea = event.currentTarget
    let currentValue = value
    let selectionStart = textarea.selectionStart
    let selectionEnd = textarea.selectionEnd
    setIsSavingImage(true)

    try {
      for (const imageFile of imageFiles) {
        const dataUrl = await readFileAsDataUrl(imageFile)
        const saved = await changbu.attachments.saveImage(dataUrl, imageFile.name)
        const snippet = `${selectionStart > 0 ? '\n\n' : ''}![${saved.markdownAlt}](${saved.fileUrl})\n\n`
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

  return (
    <div className="min-w-0 flex-1 space-y-2">
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
      {isSavingImage ? <p className="text-xs text-stone-500">图片保存中，马上会插入 Markdown 链接…</p> : null}
    </div>
  )
}
