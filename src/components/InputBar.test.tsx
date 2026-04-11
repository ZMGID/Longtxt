import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InputBar } from './InputBar'

const insertImageFiles = vi.fn()
const applyMarkdownFormat = vi.fn()

vi.mock('./MarkdownLivePreview', () => ({
  MarkdownLivePreview: forwardRef(function MockMarkdownLivePreview(
    {
      className,
      dropTarget,
      onKeyDown,
      onValueChange,
      value,
      placeholder,
    }: {
      className?: string
      dropTarget?: 'self' | 'none'
      onKeyDown?: (event: KeyboardEvent) => void
      onValueChange: (value: string) => void
      value: string
      placeholder?: string
    },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      insertImageFiles,
      applyMarkdownFormat,
    }))

    return (
      <textarea
        data-testid="markdown-live-preview"
        data-class-name={className ?? ''}
        data-drop-target={dropTarget ?? 'self'}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => onKeyDown?.(event.nativeEvent)}
      />
    )
  }),
}))

afterEach(() => {
  insertImageFiles.mockClear()
  applyMarkdownFormat.mockClear()
})

describe('InputBar', () => {
  it('accepts image drops anywhere in the embedded card and forwards them to the editor', () => {
    const { container } = render(<InputBar embedded onSubmit={vi.fn(async () => {})} />)

    const file = new File(['png'], 'drag.png', { type: 'image/png' })
    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      types: ['Files'],
      dropEffect: 'none',
    }

    const card = container.firstElementChild as HTMLElement

    fireEvent.dragEnter(card, { dataTransfer })
    expect(card.className).toContain('ring-2')

    fireEvent.drop(card, { dataTransfer, clientX: 20, clientY: 30 })

    expect(insertImageFiles).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({
        clientX: expect.any(Number),
        clientY: expect.any(Number),
      }),
    )
  })

  it('constrains the embedded editor height and keeps internal scrolling available', () => {
    render(<InputBar embedded onSubmit={vi.fn(async () => {})} />)

    expect(screen.getByText('继续往下写 · Enter 换行 · Shift+Enter 创建块 · 长内容可在输入区内滚动')).toBeInTheDocument()
    expect(screen.getByText('继续往下写 · Enter 换行 · Shift+Enter 创建块 · 长内容可在输入区内滚动').closest('div')).toHaveClass('w-full')
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-scroller]:overflow-auto'),
    )
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-editor]:max-h-[52vh]'),
    )
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute('data-drop-target', 'none')
  })

  it('renders markdown tool buttons and forwards formatting actions to the editor', () => {
    render(<InputBar embedded onSubmit={vi.fn(async () => {})} />)

    fireEvent.click(screen.getByRole('button', { name: '标题' }))
    fireEvent.click(screen.getByRole('button', { name: '代码块' }))
    fireEvent.click(screen.getByRole('button', { name: '加粗' }))

    expect(applyMarkdownFormat).toHaveBeenNthCalledWith(1, 'heading')
    expect(applyMarkdownFormat).toHaveBeenNthCalledWith(2, 'codeBlock')
    expect(applyMarkdownFormat).toHaveBeenNthCalledWith(3, 'bold')
  })

  it('also constrains the default editor height', () => {
    render(<InputBar onSubmit={vi.fn(async () => {})} />)

    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute(
      'data-class-name',
      expect.stringContaining('[&_.cm-editor]:max-h-[48vh]'),
    )
    expect(screen.getByTestId('markdown-live-preview')).toHaveAttribute('data-drop-target', 'none')
  })

  it('does not submit on plain Enter', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<InputBar embedded onSubmit={onSubmit} />)

    const editor = screen.getByTestId('markdown-live-preview')
    fireEvent.change(editor, { target: { value: 'plain enter' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  it('submits on Shift+Enter', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<InputBar embedded onSubmit={onSubmit} />)

    const editor = screen.getByTestId('markdown-live-preview')
    fireEvent.change(editor, { target: { value: 'shift submit' } })
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('shift submit')
    })
  })
})
