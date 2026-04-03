import Database from 'better-sqlite3'

import type { AIExecutionMode, Block, BlockStatus, PaginationInput, TagKind, TagSuggestion } from '../../shared/types'

interface BlockRow {
  id: string
  content: string
  summary: string | null
  status: BlockStatus
  ai_mode: AIExecutionMode
  error_message: string | null
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
  createdAt: string
  updatedAt: string
}

interface BlockStateUpdate {
  id: string
  status: BlockStatus
  aiMode: AIExecutionMode
  updatedAt: string
  summary?: string | null
  errorMessage?: string | null
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
        tags: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status,
        aiMode: row.ai_mode,
        errorMessage: row.error_message,
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
          b.status,
          b.ai_mode,
          b.error_message,
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
      INSERT INTO blocks (id, content, status, ai_mode, created_at, updated_at)
      VALUES (@id, @content, @status, @aiMode, @createdAt, @updatedAt)
    `,
  ).run(input)

  return getBlockById(db, input.id)
}

export function listBlocks(db: Database.Database, params: PaginationInput = {}): Block[] {
  const limit = params.limit ?? 200
  const offset = params.offset ?? 0
  const rows = db
    .prepare(
      `
        SELECT id
        FROM blocks
        ORDER BY created_at ASC
        LIMIT ?
        OFFSET ?
      `,
    )
    .all(limit, offset) as Array<{ id: string }>

  return hydrateBlocks(
    db,
    rows.map((row) => row.id),
  )
}

export function getBlockById(db: Database.Database, id: string): Block {
  const blocks = hydrateBlocks(db, [id])
  const [block] = blocks

  if (!block) {
    throw new Error(`Block ${id} not found`)
  }

  return block
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
        status = @status,
        ai_mode = @aiMode,
        error_message = NULL,
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
        summary = @summary,
        updated_at = @updatedAt
      WHERE id = @id
    `,
  ).run({
    ...input,
    summary: input.summary ?? null,
    errorMessage: input.errorMessage ?? null,
  })

  return getBlockById(db, input.id)
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
