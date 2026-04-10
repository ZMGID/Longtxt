import Database from 'better-sqlite3'

import type {
  AIExecutionMode,
  Block,
  BlockProcessingErrorCode,
  BlockImageAnnotation,
  BlockListInput,
  BlockListPage,
  BlockStatus,
  TagKind,
  TagSuggestion,
} from '../../shared/types'

interface BlockRow {
  id: string
  content: string
  summary: string | null
  image_annotations: string | null
  status: BlockStatus
  ai_mode: AIExecutionMode
  error_message: string | null
  error_code: BlockProcessingErrorCode | null
  created_at: string
  updated_at: string
  tag_id: string | null
  tag_name: string | null
  tag_is_default: number | null
  tag_source: 'auto' | 'manual' | null
  tag_kind: TagKind | null
}

interface UpsertBlockInput {
  id: string
  content: string
  summary?: string | null
  status: BlockStatus
  aiMode: AIExecutionMode
  errorCode?: BlockProcessingErrorCode | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
}

interface BlockStateUpdate {
  id: string
  status: BlockStatus
  aiMode: AIExecutionMode
  updatedAt: string
  errorCode?: BlockProcessingErrorCode | null
  errorMessage?: string | null
}

interface BlockEnrichmentUpdate {
  id: string
  status: BlockStatus
  aiMode: AIExecutionMode
  updatedAt: string
  summary?: string | null
  imageAnnotations?: BlockImageAnnotation[] | null
  searchText: string
}

export interface RecentBlockContentRow {
  blockId: string
  content: string
}

const IMAGE_ANNOTATIONS_HEADING = '[Image annotations]'

export function normalizeBlockImageAnnotations(value: unknown): BlockImageAnnotation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const annotation = typeof item?.annotation === 'string' ? item.annotation.trim().replace(/\s+/g, ' ') : ''
      const rawIndex = typeof item?.index === 'number' ? Math.trunc(item.index) : Number.NaN

      if (!annotation || !Number.isInteger(rawIndex) || rawIndex < 0) {
        return null
      }

      return {
        index: rawIndex,
        annotation: annotation.slice(0, 240),
      }
    })
    .filter((item): item is BlockImageAnnotation => Boolean(item))
    .sort((left, right) => left.index - right.index)
}

export function parseBlockImageAnnotations(raw: string | null): BlockImageAnnotation[] {
  if (!raw) {
    return []
  }

  try {
    return normalizeBlockImageAnnotations(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

function serializeBlockImageAnnotations(value: BlockImageAnnotation[] | null | undefined): string | null {
  const normalized = normalizeBlockImageAnnotations(value)
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

export function buildBlockSearchText(content: string, imageAnnotations?: BlockImageAnnotation[] | null): string {
  const normalizedContent = content.trim()
  const normalizedAnnotations = normalizeBlockImageAnnotations(imageAnnotations)

  if (normalizedAnnotations.length === 0) {
    return normalizedContent
  }

  const annotationSection = normalizedAnnotations
    .map((item) => `Image ${item.index + 1}: ${item.annotation}`)
    .join('\n')

  return [normalizedContent, IMAGE_ANNOTATIONS_HEADING, annotationSection]
    .filter(Boolean)
    .join('\n\n')
}

function rowsToBlocks(rows: BlockRow[]): Block[] {
  const blockMap = new Map<string, Block>()

  for (const row of rows) {
    const existingBlock =
      blockMap.get(row.id) ??
      {
        id: row.id,
        content: row.content,
        summary: row.summary,
        imageAnnotations: parseBlockImageAnnotations(row.image_annotations),
        tags: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status,
        aiMode: row.ai_mode,
        errorMessage: row.error_message,
        errorCode: row.error_code,
      }

    if (!blockMap.has(row.id)) {
      blockMap.set(row.id, existingBlock)
    }

    if (row.tag_id && row.tag_name) {
      existingBlock.tags.push({
        id: row.tag_id,
        name: row.tag_name,
        isDefault: Boolean(row.tag_is_default),
        source: row.tag_source ?? 'auto',
        kind: row.tag_kind ?? 'detail',
      })
    }
  }

  return Array.from(blockMap.values())
}

function hydrateBlocks(db: Database.Database, ids: string[]): Block[] {
  if (ids.length === 0) {
    return []
  }

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
        SELECT
          b.id,
          b.content,
          b.summary,
          b.image_annotations,
          b.status,
          b.ai_mode,
          b.error_message,
          b.error_code,
          b.created_at,
          b.updated_at,
          t.id AS tag_id,
          t.name AS tag_name,
          t.is_default AS tag_is_default,
          bt.source AS tag_source,
          t.kind AS tag_kind
        FROM blocks b
        LEFT JOIN block_tags bt ON bt.block_id = b.id
        LEFT JOIN tags t ON t.id = bt.tag_id
        WHERE b.id IN (${placeholders})
        ORDER BY b.created_at ASC, t.name ASC
      `,
    )
    .all(...ids) as BlockRow[]

  const blockMap = new Map(rowsToBlocks(rows).map((block) => [block.id, block]))

  return ids
    .map((id) => blockMap.get(id))
    .filter((block): block is Block => Boolean(block))
}

export function createBlockRecord(db: Database.Database, input: UpsertBlockInput): Block {
  db.prepare(
    `
      INSERT INTO blocks (
        id,
        content,
        summary,
        image_annotations,
        search_text,
        status,
        ai_mode,
        error_message,
        error_code,
        created_at,
        updated_at
      )
      VALUES (@id, @content, NULL, NULL, @searchText, @status, @aiMode, @errorMessage, @errorCode, @createdAt, @updatedAt)
    `,
  ).run({
    ...input,
    searchText: buildBlockSearchText(input.content),
    errorMessage: input.errorMessage ?? null,
    errorCode: input.errorCode ?? null,
  })

  return getBlockById(db, input.id)
}

export function listBlocks(db: Database.Database, params: BlockListInput = {}): BlockListPage {
  const limit = Math.max(1, Math.trunc(params.limit ?? 200))
  const cursor = params.cursor ?? null
  const rows = (
    cursor
      ? db
          .prepare(
            `
              SELECT id, created_at AS createdAt
              FROM blocks
              WHERE created_at < ?
                 OR (created_at = ? AND id < ?)
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `,
          )
          .all(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : db
          .prepare(
            `
              SELECT id, created_at AS createdAt
              FROM blocks
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `,
          )
          .all(limit + 1)
  ) as Array<{ id: string; createdAt: string }>

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const items = hydrateBlocks(
    db,
    pageRows.map((row) => row.id),
  )
  const lastItem = items.at(-1)

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem
      ? {
          createdAt: lastItem.createdAt,
          id: lastItem.id,
        }
      : null,
  }
}

export function getBlockById(db: Database.Database, id: string): Block {
  const blocks = hydrateBlocks(db, [id])
  const [block] = blocks

  if (!block) {
    throw new Error(`Block ${id} not found`)
  }

  return block
}

export function getBlockContextWindow(
  db: Database.Database,
  blockId: string,
  options: { before?: number; after?: number } = {},
): Block[] {
  const targetRow = db
    .prepare(
      `
        SELECT id, created_at AS createdAt
        FROM blocks
        WHERE id = ?
      `,
    )
    .get(blockId) as { id: string; createdAt: string } | undefined

  if (!targetRow) {
    throw new Error(`Block ${blockId} not found`)
  }

  const before = Math.max(0, Math.trunc(options.before ?? 3))
  const after = Math.max(0, Math.trunc(options.after ?? 3))

  const newerRows = before > 0
    ? (db
        .prepare(
          `
            SELECT id
            FROM blocks
            WHERE created_at > ?
               OR (created_at = ? AND id > ?)
            ORDER BY created_at ASC, id ASC
            LIMIT ?
          `,
        )
        .all(targetRow.createdAt, targetRow.createdAt, targetRow.id, before) as Array<{ id: string }>)
    : []

  const olderRows = after > 0
    ? (db
        .prepare(
          `
            SELECT id
            FROM blocks
            WHERE created_at < ?
               OR (created_at = ? AND id < ?)
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          `,
        )
        .all(targetRow.createdAt, targetRow.createdAt, targetRow.id, after) as Array<{ id: string }>)
    : []

  const orderedIds = [
    ...newerRows.map((row) => row.id).reverse(),
    targetRow.id,
    ...olderRows.map((row) => row.id),
  ]

  return hydrateBlocks(db, orderedIds)
}

export function updateBlockContent(
  db: Database.Database,
  input: Pick<UpsertBlockInput, 'id' | 'content' | 'status' | 'aiMode' | 'updatedAt'>,
): Block {
  db.prepare(
    `
      UPDATE blocks
      SET
        content = @content,
        summary = NULL,
        image_annotations = NULL,
        search_text = @content,
        status = @status,
        ai_mode = @aiMode,
        error_message = NULL,
        error_code = NULL,
        updated_at = @updatedAt
      WHERE id = @id
    `,
  ).run(input)

  return getBlockById(db, input.id)
}

export function updateBlockState(db: Database.Database, input: BlockStateUpdate): Block {
  db.prepare(
    `
      UPDATE blocks
      SET
        status = @status,
        ai_mode = @aiMode,
        error_message = @errorMessage,
        error_code = @errorCode,
        updated_at = @updatedAt
      WHERE id = @id
    `,
  ).run({
    ...input,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  })

  return getBlockById(db, input.id)
}

export function updateBlockEnrichmentResult(db: Database.Database, input: BlockEnrichmentUpdate): Block {
  db.prepare(
    `
      UPDATE blocks
      SET
        status = @status,
        ai_mode = @aiMode,
        error_message = NULL,
        error_code = NULL,
        summary = @summary,
        image_annotations = @imageAnnotations,
        search_text = @searchText,
        updated_at = @updatedAt
      WHERE id = @id
    `,
  ).run({
    ...input,
    summary: input.summary ?? null,
    imageAnnotations: serializeBlockImageAnnotations(input.imageAnnotations),
  })

  return getBlockById(db, input.id)
}

export function replaceBlockImageDerivedData(
  db: Database.Database,
  blockId: string,
  imageAnnotations: BlockImageAnnotation[] | null,
  searchText: string,
): Block {
  db.prepare(
    `
      UPDATE blocks
      SET
        image_annotations = ?,
        search_text = ?
      WHERE id = ?
    `,
  ).run(serializeBlockImageAnnotations(imageAnnotations), searchText, blockId)

  return getBlockById(db, blockId)
}

export function syncAutoBlockTags(db: Database.Database, blockId: string, tags: TagSuggestion[]): void {
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM block_tags WHERE block_id = ? AND source = 'auto'`).run(blockId)

    const insert = db.prepare(
      `
        INSERT INTO block_tags (block_id, tag_id, source)
        VALUES (?, ?, 'auto')
        ON CONFLICT(block_id, tag_id) DO NOTHING
      `,
    )

    for (const tag of tags) {
      insert.run(blockId, tag.id)
    }
  })

  transaction()
}

export function clearAutoBlockTags(db: Database.Database, blockId: string): void {
  db.prepare(`DELETE FROM block_tags WHERE block_id = ? AND source = 'auto'`).run(blockId)
}

export function addManualTagToBlock(db: Database.Database, blockId: string, tag: TagSuggestion): Block {
  db.prepare(
    `
      INSERT INTO block_tags (block_id, tag_id, source)
      VALUES (?, ?, 'manual')
      ON CONFLICT(block_id, tag_id) DO UPDATE SET source = 'manual'
    `,
  ).run(blockId, tag.id)

  return getBlockById(db, blockId)
}

export function removeTagFromBlock(db: Database.Database, blockId: string, tagId: string): Block {
  db.prepare(`DELETE FROM block_tags WHERE block_id = ? AND tag_id = ?`).run(blockId, tagId)
  return getBlockById(db, blockId)
}

export function deleteBlockRecord(db: Database.Database, id: string): Block {
  const block = getBlockById(db, id)
  db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id)
  return block
}

export function countBlocks(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM blocks`).get() as { total: number }
  return row.total
}

export function getBlocksByIds(db: Database.Database, ids: string[]): Block[] {
  return hydrateBlocks(db, ids)
}

export function getBlockSearchTextsByIds(db: Database.Database, ids: string[]): Map<string, string> {
  if (ids.length === 0) {
    return new Map()
  }

  const rows = db
    .prepare(
      `
        SELECT id, search_text
        FROM blocks
        WHERE id IN (${ids.map(() => '?').join(', ')})
      `,
    )
    .all(...ids) as Array<{ id: string; search_text: string | null }>

  return new Map(rows.map((row) => [row.id, row.search_text ?? '']))
}

function formatLocalDate(value: string): string {
  const date = new Date(value)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function listBlocksByDate(db: Database.Database, date: string): Block[] {
  const localStart = new Date(`${date}T00:00:00`)
  const localEnd = new Date(localStart)
  localEnd.setDate(localEnd.getDate() + 1)

  const queryStart = new Date(localStart)
  queryStart.setHours(queryStart.getHours() - 18)

  const queryEnd = new Date(localEnd)
  queryEnd.setHours(queryEnd.getHours() + 18)

  const rows = db
    .prepare(
      `
        SELECT id
        FROM blocks
        WHERE created_at >= ? AND created_at < ?
        ORDER BY created_at DESC
      `,
    )
    .all(queryStart.toISOString(), queryEnd.toISOString()) as Array<{ id: string }>

  return hydrateBlocks(
    db,
    rows
      .map((row) => row.id)
      .filter((id, index, ids) => ids.indexOf(id) === index),
  ).filter((block) => formatLocalDate(block.createdAt) === date)
}

export function listRecentBlockContents(db: Database.Database, limit: number, excludeBlockId?: string): string[] {
  if (limit <= 0) {
    return []
  }

  const rows = excludeBlockId
    ? (db.prepare(`SELECT content FROM blocks WHERE id != ? ORDER BY updated_at DESC LIMIT ?`).all(excludeBlockId, limit) as Array<{
        content: string
      }>)
    : (db.prepare(`SELECT content FROM blocks ORDER BY updated_at DESC LIMIT ?`).all(limit) as Array<{ content: string }>)

  return rows.map((row) => row.content)
}

export function listRecentBlockContentRows(db: Database.Database, limit: number): RecentBlockContentRow[] {
  if (limit <= 0) {
    return []
  }

  return db.prepare(`SELECT id AS blockId, content FROM blocks ORDER BY updated_at DESC LIMIT ?`).all(limit) as RecentBlockContentRow[]
}

export function listBlockIdsWithMarkdownImages(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `
        SELECT id
        FROM blocks
        WHERE content LIKE '%![%'
        ORDER BY updated_at DESC
      `,
    )
    .all() as Array<{ id: string }>

  return rows.map((row) => row.id)
}
