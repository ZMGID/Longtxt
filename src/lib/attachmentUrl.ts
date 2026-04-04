export const ATTACHMENT_PROTOCOL = 'changbu-attachment'

export function toRenderableAttachmentUrl(url: string | null | undefined): string {
  const source = url?.trim() ?? ''

  if (!source) {
    return ''
  }

  if (!source.startsWith('file://')) {
    return source
  }

  return `${ATTACHMENT_PROTOCOL}://asset?url=${encodeURIComponent(source)}`
}
