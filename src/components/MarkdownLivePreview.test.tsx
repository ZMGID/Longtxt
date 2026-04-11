import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MarkdownLivePreview, type MarkdownLivePreviewHandle } from './MarkdownLivePreview'

const saveImage = vi.fn(async () => ({ fileUrl: 'file:///tmp/drop.png', markdownAlt: 'drop-image' }))
const writeImage = vi.fn(async () => {})
const writeText = vi.fn(async () => {})
const fetchMock = vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))

beforeEach(() => {
  window.changbu = {
    attachments: {
      saveImage,
    },
  } as never

  Object.assign(navigator, {
    clipboard: {
      write: writeImage,
      writeText,
    },
  })

  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('ClipboardItem', class ClipboardItem {
    data: Record<string, Blob>

    constructor(data: Record<string, Blob>) {
      this.data = data
    }
  })
})

afterEach(() => {
  saveImage.mockClear()
  writeImage.mockClear()
  writeText.mockClear()
  fetchMock.mockClear()
  vi.unstubAllGlobals()
})

function ControlledMarkdownLivePreview({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue)

  return (
    <div>
      <MarkdownLivePreview value={value} onValueChange={setValue} />
      <output data-testid="markdown-live-value">{value}</output>
    </div>
  )
}

function MarkdownLivePreviewFormatHarness({
  initialValue = '',
  action,
}: {
  initialValue?: string
  action: 'heading' | 'bold' | 'italic' | 'codeBlock' | 'bulletList' | 'orderedList'
}) {
  const [value, setValue] = useState(initialValue)
  const previewRef = useRef<MarkdownLivePreviewHandle | null>(null)

  return (
    <div>
      <MarkdownLivePreview ref={previewRef} value={value} onValueChange={setValue} />
      <button type="button" onClick={() => previewRef.current?.applyMarkdownFormat(action)}>
        apply-format
      </button>
      <output data-testid="markdown-live-value">{value}</output>
    </div>
  )
}

describe('MarkdownLivePreview', () => {
  it('selects the image widget when the preview is clicked', async () => {
    const { container } = render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png)'} />,
    )

    const image = await screen.findByAltText('截图')
    fireEvent.click(image)

    await waitFor(() => {
      expect(container.querySelector('.cm-image-widget-selected')).toBeInTheDocument()
      expect(screen.getByAltText('截图')).toBeInTheDocument()
    })
  })

  it('does not render the legacy floating image toolbar controls', async () => {
    render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png)'} />,
    )

    fireEvent.click(await screen.findByAltText('截图'))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '源码' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '520' })).not.toBeInTheDocument()
    })
  })

  it('can reveal the raw markdown source for an image from the context menu', async () => {
    const { container } = render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png "size=md")'} />,
    )

    fireEvent.contextMenu(await screen.findByAltText('截图'), { clientX: 24, clientY: 32 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '查看源码' }))

    await waitFor(() => {
      expect(container.querySelector('.cm-image-widget')).not.toBeInTheDocument()
      expect(container.querySelector('.cm-content')?.textContent).toContain(
        '![截图](https://example.com/image.png "size=md")',
      )
    })
  })

  it('opens a context menu and can reset image width', async () => {
    render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png "size=md")'} />,
    )

    fireEvent.contextMenu(await screen.findByAltText('截图'), { clientX: 24, clientY: 32 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '重置宽度' }))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-live-value')).toHaveTextContent(
        '![截图](https://example.com/image.png)',
      )
    })
  })

  it('can delete an image from the context menu', async () => {
    render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png)'} />,
    )

    fireEvent.contextMenu(await screen.findByAltText('截图'), { clientX: 24, clientY: 32 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除图片' }))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-live-value')).toHaveTextContent('')
    })
  })

  it('copies the image itself from the context menu', async () => {
    render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png)'} />,
    )

    fireEvent.contextMenu(await screen.findByAltText('截图'), { clientX: 24, clientY: 32 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制图片' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/image.png')
      expect(writeImage).toHaveBeenCalledTimes(1)
      expect(screen.getByText('图片已复制。')).toBeInTheDocument()
    })
  })

  it('copies the image source from the context menu', async () => {
    render(
      <ControlledMarkdownLivePreview initialValue={'![截图](https://example.com/image.png)'} />,
    )

    fireEvent.contextMenu(await screen.findByAltText('截图'), { clientX: 24, clientY: 32 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制图片地址' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://example.com/image.png')
      expect(screen.getByText('图片地址已复制。')).toBeInTheDocument()
    })
  })

  it('inserts dragged images into the editor container', async () => {
    const { container } = render(
      <ControlledMarkdownLivePreview initialValue="" />,
    )

    const imageFile = new File(['png'], 'drop.png', { type: 'image/png' })
    const dataTransfer = {
      files: [imageFile],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile }],
      types: ['Files'],
      dropEffect: 'none',
    }

    const editor = container.querySelector('.cm-editor')
    expect(editor).toBeInTheDocument()

    fireEvent.dragEnter(editor as Element, { dataTransfer })

    await waitFor(() => {
      expect(screen.getByText('拖放图片即可插入。')).toBeInTheDocument()
    })

    fireEvent.drop(editor as Element, { dataTransfer, clientX: 24, clientY: 32 })

    await waitFor(() => {
      expect(saveImage).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('markdown-live-value')).toHaveTextContent(
        '![drop-image](file:///tmp/drop.png)',
      )
    })
  })

  it('applies bold markdown formatting through the imperative handle', async () => {
    render(<MarkdownLivePreviewFormatHarness action="bold" />)

    fireEvent.click(screen.getByRole('button', { name: 'apply-format' }))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-live-value')).toHaveTextContent('**加粗文本**')
    })
  })
})
