import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { AIExecutionMode, BlockStatus, ExportOptions, ImportConflictStrategy, ImportPreview, TagKind } from '../../shared/types'
import { deleteBlockRecord } from '../db/blocks'
import { getOrCreateTag } from '../db/tags'
import { cleanupOrphanAttachments, importLocalAttachmentFile, listBlockAttachments, saveImageDataUrl, syncBlockAttachmentRecords } from './attachments'

interface ExportBlockRow {
  id: string
  content: string
  summary: string | null
  created_at: string
  updated_at: string
  status: BlockStatus
  ai_mode: AIExecutionMode
  error_message: string | null
}

interface PreparedImportBlock {
  id?: string
  filename: string
  sourcePath?: string
  content: string
  summary?: string | null
  createdAt?: string
  updatedAt?: string
  status?: BlockStatus
  aiMode?: AIExecutionMode
  errorMessage?: string | null
  tags?: Array<{ name: string; source: 'auto' | 'manual'; kind?: TagKind }>
  attachments?: Array<{ sourceUrl: string; filename: string; mimeType: string | null; altText: string | null; base64: string }>
}

interface ImportJob {
  format: 'markdown' | 'json'
  blocks: PreparedImportBlock[]
  conflicts: number
}

interface JsonExportAttachment {
  sourceUrl: string
  filename: string
  mimeType: string | null
  altText: string | null
  base64: string
}

interface JsonExportBlock {
  id: string
  content: string
  summary: string | null
  createdAt: string
  updatedAt: string
  status: BlockStatus
  aiMode: AIExecutionMode
  errorMessage: string | null
  tags: Array<{ name: string; source: 'auto' | 'manual'; kind: TagKind }>
  attachments: JsonExportAttachment[]
}

interface JsonExportPayload {
  version: 2
  exportedAt: string
  blocks: JsonExportBlock[]
}

const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeDateBoundary(value: string, boundary: 'start' | 'end'): string {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return value
  }

  const localDate = new Date(`${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}`)
  return Number.isNaN(localDate.getTime()) ? value : localDate.toISOString()
}

function sanitizeImportedStatus(status?: string): BlockStatus {
  return status === 'pending' || status === 'ready' || status === 'error' ? status : 'ready'
}

function sanitizeImportedAiMode(aiMode?: string): AIExecutionMode {
  return aiMode === 'live' || aiMode === 'mock' ? aiMode : 'mock'
}

function sanitizeFileName(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'block'
}

function summarizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function getFilteredBlockIds(db: Database.Database, options: ExportOptions): string[] {
  const whereClauses: string[] = []
  const parameters: Array<string> = []

  if (options.tagFilter && options.tagFilter.length > 0) {
    whereClauses.push(
      `
        b.id IN (
          SELECT bt.block_id
          FROM block_tags bt
          INNER JOIN tags t ON t.id = bt.tag_id
          WHERE t.name IN (${options.tagFilter.map(() => '?').join(', ')})
        )
      `,
    )
    parameters.push(...options.tagFilter)
  }

  if (options.dateRange?.start) {
    whereClauses.push(`b.created_at >= ?`)
    parameters.push(normalizeDateBoundary(options.dateRange.start, 'start'))
  }

  if (options.dateRange?.end) {
    whereClauses.push(`b.created_at <= ?`)
    parameters.push(normalizeDateBoundary(options.dateRange.end, 'end'))
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `
        SELECT b.id
        FROM blocks b
        ${whereSql}
        ORDER BY b.created_at ASC
      `,
    )
    .all(...parameters) as Array<{ id: string }>

  return rows.map((row) => row.id)
}

function getBlockRows(db: Database.Database, ids: string[]): ExportBlockRow[] {
  if (ids.length === 0) {
    return []
  }

  return db
    .prepare(
      `
        SELECT id, content, summary, created_at, updated_at, status, ai_mode, error_message
        FROM blocks
        WHERE id IN (${ids.map(() => '?').join(', ')})
        ORDER BY created_at ASC
      `,
    )
    .all(...ids) as ExportBlockRow[]
}

function getBlockTags(db: Database.Database, blockId: string): Array<{ name: string; source: 'auto' | 'manual'; kind: TagKind }> {
  return db
    .prepare(
      `
        SELECT t.name, bt.source, t.kind
        FROM block_tags bt
        INNER JOIN tags t ON t.id = bt.tag_id
        WHERE bt.block_id = ?
        ORDER BY t.name ASC
      `,
    )
    .all(blockId) as Array<{ name: string; source: 'auto' | 'manual'; kind: TagKind }>
}

async function replaceMarkdownAttachmentUrlsForExport(
  db: Database.Database,
  blockId: string,
  content: string,
  attachmentsDirectory: string,
  includeAttachments: boolean,
): Promise<string> {
  if (!includeAttachments) {
    return content
  }

  const attachments = listBlockAttachments(db, blockId)
  let nextContent = content

  for (const attachment of attachments) {
    const targetPath = join(attachmentsDirectory, attachment.filename)
    await mkdir(attachmentsDirectory, { recursive: true })
    await writeFile(targetPath, await readFile(attachment.filePath))
    nextContent = nextContent.replaceAll(attachment.fileUrl, `attachments/${attachment.filename}`)
  }

  return nextContent
}

export async function exportMarkdownBundle(
  db: Database.Database,
  targetDirectory: string,
  options: ExportOptions,
): Promise<{ path: string; count: number }> {
  const ids = getFilteredBlockIds(db, options)
  const blocks = getBlockRows(db, ids)
  const attachmentsDirectory = join(targetDirectory, 'attachments')

  await mkdir(targetDirectory, { recursive: true })

  let exportedCount = 0

  for (const block of blocks) {
    const filename = `${block.created_at.replace(/[:.]/g, '-')}-${sanitizeFileName(summarizeContent(block.content))}.md`
    const filePath = join(targetDirectory, filename)
    const content = await replaceMarkdownAttachmentUrlsForExport(db, block.id, block.content, attachmentsDirectory, options.includeAttachments)
    await writeFile(filePath, content, 'utf8')
    exportedCount += 1
  }

  if (!options.includeAttachments) {
    await rm(attachmentsDirectory, { recursive: true, force: true })
  }

  return {
    path: targetDirectory,
    count: exportedCount,
  }
}

export async function exportJsonBundle(
  db: Database.Database,
  targetFilePath: string,
  options: ExportOptions,
): Promise<{ path: string; count: number }> {
  const ids = getFilteredBlockIds(db, options)
  const blocks = getBlockRows(db, ids)
  const payload: JsonExportPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    blocks: [],
  }

  for (const block of blocks) {
    const attachments = options.includeAttachments
      ? await Promise.all(
          listBlockAttachments(db, block.id).map(async (attachment) => ({
            sourceUrl: attachment.fileUrl,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            altText: attachment.altText,
            base64: (await readFile(attachment.filePath)).toString('base64'),
          })),
        )
      : []

    payload.blocks.push({
      id: block.id,
      content: block.content,
      summary: block.summary,
      createdAt: block.created_at,
      updatedAt: block.updated_at,
      status: block.status,
      aiMode: block.ai_mode,
      errorMessage: block.error_message,
      tags: getBlockTags(db, block.id),
      attachments,
    })
  }

  await writeFile(targetFilePath, JSON.stringify(payload, null, 2), 'utf8')

  return {
    path: targetFilePath,
    count: payload.blocks.length,
  }
}

async function rewriteMarkdownAttachmentsForImport(
  db: Database.Database,
  dataDirectory: string,
  sourceFilePath: string,
  content: string,
): Promise<string> {
  const sourceDirectory = dirname(sourceFilePath)
  let nextContent = content
  const matches = Array.from(content.matchAll(IMAGE_MARKDOWN_PATTERN))

  for (const match of matches) {
    const altText = match[1] ?? 'image'
    const originalUrl = match[2] ?? ''

    if (!originalUrl || /^https?:\/\//i.test(originalUrl) || originalUrl.startsWith('file://')) {
      continue
    }

    const absolutePath = join(sourceDirectory, originalUrl)
    const saved = await importLocalAttachmentFile(db, dataDirectory, absolutePath, altText)
    nextContent = nextContent.replace(match[0], `![${saved.markdownAlt}](${saved.fileUrl})`)
  }

  return nextContent
}

export async function previewMarkdownImport(
  filePaths: string[],
): Promise<{ preview: ImportPreview; job: ImportJob }> {
  const blocks: PreparedImportBlock[] = []

  for (const filePath of filePaths) {
    const content = await readFile(filePath, 'utf8')
    blocks.push({
      filename: basename(filePath),
      sourcePath: filePath,
      content,
    })
  }

  const preview: ImportPreview = {
    importId: uuid(),
    format: 'markdown',
    totalFiles: filePaths.length,
    totalBlocks: blocks.length,
    conflicts: 0,
    samples: blocks.slice(0, 5).map((block) => ({
      filename: block.filename,
      preview: summarizeContent(block.content),
    })),
  }

  return {
    preview,
    job: {
      format: 'markdown',
      blocks,
      conflicts: 0,
    },
  }
}

export async function previewJsonImport(
  db: Database.Database,
  filePath: string,
): Promise<{ preview: ImportPreview; job: ImportJob }> {
  const raw = await readFile(filePath, 'utf8')
  const payload = JSON.parse(raw) as JsonExportPayload
  const blocks = payload.blocks.map((block) => ({
    id: block.id,
    filename: basename(filePath),
    content: block.content,
    summary: block.summary ?? null,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status: sanitizeImportedStatus(block.status),
    aiMode: sanitizeImportedAiMode(block.aiMode),
    errorMessage: typeof block.errorMessage === 'string' ? block.errorMessage : null,
    tags: block.tags,
    attachments: block.attachments,
  }))

  const conflictRows = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM blocks
        WHERE id IN (${blocks.map(() => '?').join(', ') || "''"})
      `,
    )
    .get(...blocks.map((block) => block.id!)) as { total: number }

  const preview: ImportPreview = {
    importId: uuid(),
    format: 'json',
    totalFiles: 1,
    totalBlocks: blocks.length,
    conflicts: conflictRows.total,
    samples: blocks.slice(0, 5).map((block) => ({
      filename: block.filename,
      preview: summarizeContent(block.content),
    })),
  }

  return {
    preview,
    job: {
      format: 'json',
      blocks,
      conflicts: conflictRows.total,
    },
  }
}

export async function confirmImportJob(
  db: Database.Database,
  dataDirectory: string,
  job: ImportJob,
  conflictStrategy: ImportConflictStrategy,
): Promise<{ imported: number; importedIds: string[] }> {
  let imported = 0
  const importedIds: string[] = []

  for (const block of job.blocks) {
    let content = block.content

    if (job.format === 'markdown' && block.sourcePath) {
      content = await rewriteMarkdownAttachmentsForImport(db, dataDirectory, block.sourcePath, block.content)
    }

    if (job.format === 'json' && block.attachments) {
      for (const attachment of block.attachments) {
        const dataUrl = `data:${attachment.mimeType ?? 'image/png'};base64,${attachment.base64}`
        const saved = await saveImageDataUrl(db, dataDirectory, dataUrl, attachment.filename)
        content = content.replaceAll(attachment.sourceUrl, saved.fileUrl)
      }
    }

    if (block.id) {
      const exists = db.prepare(`SELECT 1 FROM blocks WHERE id = ?`).get(block.id)

      if (exists && conflictStrategy === 'skip_all') {
        continue
      }

      if (exists && conflictStrategy === 'overwrite_all') {
        deleteBlockRecord(db, block.id)
      }
    }

    const id = block.id ?? uuid()
    const createdAt = block.createdAt ?? new Date().toISOString()
    const updatedAt = block.updatedAt ?? createdAt
    const status = job.format === 'json' ? sanitizeImportedStatus(block.status) : 'ready'
    const aiMode = job.format === 'json' ? sanitizeImportedAiMode(block.aiMode) : 'mock'

    db.prepare(
      `
        INSERT INTO blocks (id, content, summary, status, ai_mode, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, content, block.summary ?? null, status, aiMode, block.errorMessage ?? null, createdAt, updatedAt)

    syncBlockAttachmentRecords(db, dataDirectory, id, content)

    for (const tag of block.tags ?? []) {
      const ensuredTag = getOrCreateTag(db, tag.name, tag.kind ?? (tag.source === 'manual' ? 'user' : 'detail'))
      db.prepare(
        `
          INSERT INTO block_tags (block_id, tag_id, source)
          VALUES (?, ?, ?)
          ON CONFLICT(block_id, tag_id) DO UPDATE SET source = excluded.source
        `,
      ).run(id, ensuredTag.id, tag.source)
    }

    imported += 1
    importedIds.push(id)
  }

  await cleanupOrphanAttachments(db, dataDirectory)

  return { imported, importedIds }
}
