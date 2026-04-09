import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import Database from 'better-sqlite3'

import type { AttachmentIndexRebuildResult } from '../../shared/types'

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

interface AttachmentReference {
  altText: string
  url: string
  sortOrder: number
}

export interface ResolvedBlockImageInput {
  index: number
  altText: string | null
  url: string
  mimeType: string | null
}

export interface ResolvedBlockImageInputResult {
  images: ResolvedBlockImageInput[]
  skippedCount: number
  totalCount: number
}

interface AttachmentRow {
  id: string
  file_url: string
  file_path: string
  filename?: string
  mime_type?: string | null
}

interface StagedAttachmentFile {
  filePath: string
  fileUrl: string
  markdownAlt: string
  mimeType: string | null
}

interface StageLocalAttachmentOptions {
  allowedSourceDirectory?: string
}

function getAttachmentsDirectory(dataDirectory: string): string {
  return join(dataDirectory, 'attachments')
}

function getExtensionFromMimeType(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? 'png'
}

function getMimeTypeFromFilename(filename: string): string | null {
  const extension = extname(filename).toLowerCase()

  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return null
  }
}

function sanitizeAltText(filenameHint?: string): string {
  const source = filenameHint?.trim() || 'image'
  const withoutExtension = source.replace(/\.[^.]+$/, '')
  return withoutExtension.replace(/\s+/g, '-').slice(0, 40) || 'image'
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = relative(resolve(directoryPath), resolve(filePath))

  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function extractAttachmentReferences(content: string): AttachmentReference[] {
  const references: AttachmentReference[] = []

  for (const [index, match] of Array.from(content.matchAll(IMAGE_MARKDOWN_PATTERN)).entries()) {
    const altText = match[1]?.trim() ?? ''
    const url = match[2]?.trim() ?? ''

    if (!url) {
      continue
    }

    references.push({
      altText,
      url,
      sortOrder: index,
    })
  }

  return references
}

export function hasMarkdownImages(content: string): boolean {
  IMAGE_MARKDOWN_PATTERN.lastIndex = 0
  return IMAGE_MARKDOWN_PATTERN.test(content)
}

function toLocalAttachmentPath(url: string, dataDirectory: string): string | null {
  try {
    const filePath = resolve(fileURLToPath(url))
    const attachmentsDirectory = resolve(getAttachmentsDirectory(dataDirectory))
    const relativePath = relative(attachmentsDirectory, filePath)

    if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      return null
    }

    return filePath
  } catch {
    return null
  }
}

function getAttachmentByUrl(db: Database.Database, fileUrl: string): AttachmentRow | null {
  const row = db
    .prepare(
      `
        SELECT id, file_url, file_path
        FROM attachments
        WHERE file_url = ?
      `,
    )
    .get(fileUrl) as AttachmentRow | undefined

  return row ?? null
}

function ensureAttachmentRecord(db: Database.Database, fileUrl: string, filePath: string, mimeType: string | null): AttachmentRow {
  const existing = getAttachmentByUrl(db, fileUrl)

  if (existing) {
    db.prepare(
      `
        UPDATE attachments
        SET file_path = ?, mime_type = ?, updated_at = ?
        WHERE id = ?
      `,
    ).run(filePath, mimeType, new Date().toISOString(), existing.id)

    return existing
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const filename = basename(filePath)
  db.prepare(
    `
      INSERT INTO attachments (id, file_url, file_path, mime_type, filename, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(id, fileUrl, filePath, mimeType, filename, now, now)

  return {
    id,
    file_url: fileUrl,
    file_path: filePath,
  }
}

async function stageAttachmentFile(
  dataDirectory: string,
  payload: Buffer,
  extension: string,
  mimeType: string | null,
  filenameHint?: string,
): Promise<StagedAttachmentFile> {
  const attachmentsDirectory = getAttachmentsDirectory(dataDirectory)
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`
  const filename = `${Date.now()}-${randomUUID()}${normalizedExtension}`
  const filePath = join(attachmentsDirectory, filename)

  await mkdir(attachmentsDirectory, { recursive: true })
  await writeFile(filePath, payload)

  return {
    filePath,
    fileUrl: pathToFileURL(filePath).toString(),
    markdownAlt: sanitizeAltText(filenameHint ?? filename),
    mimeType,
  }
}

export async function stageImageDataUrl(
  dataDirectory: string,
  dataUrl: string,
  filenameHint?: string,
): Promise<StagedAttachmentFile> {
  const match = dataUrl.match(DATA_URL_PATTERN)

  if (!match) {
    throw new Error('不支持的图片数据格式。')
  }

  const [, mimeType, base64Payload] = match
  return stageAttachmentFile(dataDirectory, Buffer.from(base64Payload, 'base64'), getExtensionFromMimeType(mimeType), mimeType, filenameHint)
}

export async function stageLocalAttachmentFile(
  dataDirectory: string,
  sourcePath: string,
  filenameHint?: string,
  options: StageLocalAttachmentOptions = {},
): Promise<StagedAttachmentFile> {
  const resolvedSourcePath = resolve(sourcePath)
  const mimeType = getMimeTypeFromFilename(resolvedSourcePath)

  if (!mimeType) {
    throw new Error('仅支持导入 PNG、JPG、WEBP、GIF 或 SVG 图片附件。')
  }

  if (options.allowedSourceDirectory && !isPathInsideDirectory(resolvedSourcePath, options.allowedSourceDirectory)) {
    throw new Error('Markdown 附件必须位于导入文件所在目录内。')
  }

  return stageAttachmentFile(
    dataDirectory,
    await readFile(resolvedSourcePath),
    extname(resolvedSourcePath) || `.${getExtensionFromMimeType(mimeType)}`,
    mimeType,
    filenameHint ?? basename(resolvedSourcePath),
  )
}

export async function saveImageDataUrl(
  db: Database.Database,
  dataDirectory: string,
  dataUrl: string,
  filenameHint?: string,
): Promise<{ fileUrl: string; markdownAlt: string }> {
  const staged = await stageImageDataUrl(dataDirectory, dataUrl, filenameHint)
  ensureAttachmentRecord(db, staged.fileUrl, staged.filePath, staged.mimeType)

  return {
    fileUrl: staged.fileUrl,
    markdownAlt: staged.markdownAlt,
  }
}

export async function importLocalAttachmentFile(
  db: Database.Database,
  dataDirectory: string,
  sourcePath: string,
  filenameHint?: string,
): Promise<{ fileUrl: string; markdownAlt: string }> {
  const staged = await stageLocalAttachmentFile(dataDirectory, sourcePath, filenameHint)
  ensureAttachmentRecord(db, staged.fileUrl, staged.filePath, staged.mimeType)

  return {
    fileUrl: staged.fileUrl,
    markdownAlt: staged.markdownAlt,
  }
}

export function syncBlockAttachmentRecords(
  db: Database.Database,
  dataDirectory: string,
  blockId: string,
  content: string,
): void {
  const references = extractAttachmentReferences(content)
  const transaction = db.transaction((items: AttachmentReference[]) => {
    db.prepare(`DELETE FROM block_attachments WHERE block_id = ?`).run(blockId)

    const insertLink = db.prepare(
      `
        INSERT INTO block_attachments (block_id, attachment_id, sort_order, alt_text)
        VALUES (?, ?, ?, ?)
      `,
    )

    for (const item of items) {
      const localPath = toLocalAttachmentPath(item.url, dataDirectory)

      if (!localPath) {
        continue
      }

      const attachment = ensureAttachmentRecord(db, item.url, localPath, getMimeTypeFromFilename(localPath))
      insertLink.run(blockId, attachment.id, item.sortOrder, item.altText || null)
    }
  })

  transaction(references)
}

export async function cleanupOrphanAttachments(
  db: Database.Database,
  dataDirectory: string,
): Promise<number> {
  const orphanRows = db
    .prepare(
      `
        SELECT a.id, a.file_url, a.file_path
        FROM attachments a
        LEFT JOIN block_attachments ba ON ba.attachment_id = a.id
        WHERE ba.attachment_id IS NULL
      `,
    )
    .all() as AttachmentRow[]
  let removedCount = 0

  for (const orphan of orphanRows) {
    const localPath = toLocalAttachmentPath(orphan.file_url, dataDirectory) ?? orphan.file_path

    await rm(localPath, { force: true })
    db.prepare(`DELETE FROM attachments WHERE id = ?`).run(orphan.id)
    removedCount += 1
  }

  return removedCount
}

export function listBlockAttachments(
  db: Database.Database,
  blockId: string,
): Array<{ id: string; fileUrl: string; filePath: string; filename: string; mimeType: string | null; altText: string | null }> {
  const rows = db
    .prepare(
      `
        SELECT a.id, a.file_url, a.file_path, a.filename, a.mime_type, ba.alt_text
        FROM block_attachments ba
        INNER JOIN attachments a ON a.id = ba.attachment_id
        WHERE ba.block_id = ?
        ORDER BY ba.sort_order ASC
      `,
    )
    .all(blockId) as Array<{
    id: string
    file_url: string
    file_path: string
    filename: string
    mime_type: string | null
    alt_text: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    fileUrl: row.file_url,
    filePath: row.file_path,
    filename: row.filename,
    mimeType: row.mime_type,
    altText: row.alt_text,
  }))
}

export async function readAttachmentBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  return buffer.toString('base64')
}

export async function resolveBlockImageInputs(
  dataDirectory: string,
  content: string,
  maxImages = 4,
): Promise<ResolvedBlockImageInputResult> {
  const references = extractAttachmentReferences(content)
  const images: ResolvedBlockImageInput[] = []
  let skippedCount = 0

  for (const reference of references) {
    if (images.length >= maxImages) {
      skippedCount += 1
      continue
    }

    if (/^https?:\/\//i.test(reference.url)) {
      images.push({
        index: reference.sortOrder,
        altText: reference.altText || null,
        url: reference.url,
        mimeType: null,
      })
      continue
    }

    const localPath = toLocalAttachmentPath(reference.url, dataDirectory)

    if (!localPath) {
      skippedCount += 1
      continue
    }

    const mimeType = getMimeTypeFromFilename(localPath)

    if (!mimeType) {
      skippedCount += 1
      continue
    }

    const base64 = await readAttachmentBase64(localPath)
    images.push({
      index: reference.sortOrder,
      altText: reference.altText || null,
      url: `data:${mimeType};base64,${base64}`,
      mimeType,
    })
  }

  return {
    images,
    skippedCount,
    totalCount: references.length,
  }
}

export async function rebuildAttachmentIndex(db: Database.Database, dataDirectory: string): Promise<AttachmentIndexRebuildResult> {
  const blocks = db
    .prepare(
      `
        SELECT id, content
        FROM blocks
        ORDER BY created_at ASC
      `,
    )
    .all() as Array<{ id: string; content: string }>

  for (const block of blocks) {
    syncBlockAttachmentRecords(db, dataDirectory, block.id, block.content)
  }

  const removedOrphanCount = await cleanupOrphanAttachments(db, dataDirectory)
  const attachmentCount = (db.prepare(`SELECT COUNT(*) AS total FROM attachments`).get() as { total: number }).total

  return {
    indexedBlockCount: blocks.length,
    attachmentCount,
    removedOrphanCount,
  }
}
