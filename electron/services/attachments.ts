import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import Database from 'better-sqlite3'

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

interface AttachmentRow {
  id: string
  file_url: string
  file_path: string
  filename?: string
  mime_type?: string | null
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

export async function saveImageDataUrl(
  db: Database.Database,
  dataDirectory: string,
  dataUrl: string,
  filenameHint?: string,
): Promise<{ fileUrl: string; markdownAlt: string }> {
  const match = dataUrl.match(DATA_URL_PATTERN)

  if (!match) {
    throw new Error('不支持的图片数据格式。')
  }

  const [, mimeType, base64Payload] = match
  const extension = getExtensionFromMimeType(mimeType)
  const attachmentsDirectory = getAttachmentsDirectory(dataDirectory)
  const filename = `${Date.now()}-${randomUUID()}.${extension}`
  const filePath = join(attachmentsDirectory, filename)

  await mkdir(attachmentsDirectory, { recursive: true })
  await writeFile(filePath, Buffer.from(base64Payload, 'base64'))

  const fileUrl = pathToFileURL(filePath).toString()
  ensureAttachmentRecord(db, fileUrl, filePath, mimeType)

  return {
    fileUrl,
    markdownAlt: sanitizeAltText(filenameHint),
  }
}

export async function importLocalAttachmentFile(
  db: Database.Database,
  dataDirectory: string,
  sourcePath: string,
  filenameHint?: string,
): Promise<{ fileUrl: string; markdownAlt: string }> {
  const attachmentsDirectory = getAttachmentsDirectory(dataDirectory)
  const extension = extname(sourcePath) || '.png'
  const filename = `${Date.now()}-${randomUUID()}${extension}`
  const targetPath = join(attachmentsDirectory, filename)

  await mkdir(attachmentsDirectory, { recursive: true })
  await copyFile(sourcePath, targetPath)

  const fileUrl = pathToFileURL(targetPath).toString()
  ensureAttachmentRecord(db, fileUrl, targetPath, getMimeTypeFromFilename(targetPath))

  return {
    fileUrl,
    markdownAlt: sanitizeAltText(filenameHint ?? basename(sourcePath)),
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
): Promise<void> {
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

  for (const orphan of orphanRows) {
    const localPath = toLocalAttachmentPath(orphan.file_url, dataDirectory) ?? orphan.file_path

    await rm(localPath, { force: true })
    db.prepare(`DELETE FROM attachments WHERE id = ?`).run(orphan.id)
  }
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

export async function rebuildAttachmentIndex(db: Database.Database, dataDirectory: string): Promise<void> {
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

  await cleanupOrphanAttachments(db, dataDirectory)
}
