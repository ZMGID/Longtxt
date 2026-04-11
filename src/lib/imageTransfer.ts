interface TransferItemLike {
  kind?: string
  type?: string
  getAsFile?: () => File | null
}

interface TransferPayloadLike {
  items?: Iterable<TransferItemLike | null | undefined> | ArrayLike<TransferItemLike | null | undefined> | null
  files?: Iterable<File | null | undefined> | ArrayLike<File | null | undefined> | null
  types?: Iterable<string | null | undefined> | ArrayLike<string | null | undefined> | null
}

const IMAGE_FILE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif|heic|heif)$/i

function toArray<T>(input: Iterable<T> | ArrayLike<T> | null | undefined): T[] {
  if (!input) {
    return []
  }

  return Array.from(input)
}

function isImageFile(file: File | null | undefined): file is File {
  return Boolean(file && (file.type.startsWith('image/') || IMAGE_FILE_EXTENSION_PATTERN.test(file.name)))
}

export function extractImageFiles(payload?: TransferPayloadLike | null): File[] {
  const itemFiles = toArray(payload?.items)
    .filter((item): item is TransferItemLike => Boolean(item))
    .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
    .map((item) => item.getAsFile?.() ?? null)
    .filter(isImageFile)

  if (itemFiles.length > 0) {
    return itemFiles
  }

  return toArray(payload?.files).filter(isImageFile)
}

export function hasPotentialImageTransfer(payload?: TransferPayloadLike | null): boolean {
  if (extractImageFiles(payload).length > 0) {
    return true
  }

  const hasImageishFileItem = toArray(payload?.items)
    .filter((item): item is TransferItemLike => Boolean(item))
    .some((item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')))

  if (hasImageishFileItem) {
    return true
  }

  return toArray(payload?.types)
    .filter((item): item is string => typeof item === 'string')
    .some((type) => type === 'Files')
}
