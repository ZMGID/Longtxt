import { changbu } from './changbu'

export interface SavedMarkdownImage {
  fileUrl: string
  markdownAlt: string
}

export function readFileAsDataUrl(file: File): Promise<string> {
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

export async function saveMarkdownImageFile(file: File): Promise<SavedMarkdownImage> {
  const dataUrl = await readFileAsDataUrl(file)
  return changbu.attachments.saveImage(dataUrl, file.name)
}

export async function saveMarkdownImageFiles(files: File[]): Promise<SavedMarkdownImage[]> {
  const results: SavedMarkdownImage[] = []

  for (const file of files) {
    results.push(await saveMarkdownImageFile(file))
  }

  return results
}

export function buildMarkdownImageSnippet(
  image: Pick<SavedMarkdownImage, 'fileUrl' | 'markdownAlt'>,
  needsLeadingSpacing: boolean,
): string {
  return `${needsLeadingSpacing ? '\n\n' : ''}![${image.markdownAlt}](${image.fileUrl})\n\n`
}
