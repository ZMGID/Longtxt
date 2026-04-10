import { existsSync } from 'node:fs'

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { v4 as uuid } from 'uuid'

import { baseMigrations } from './migrations'
import { migrateTagKinds, seedDefaultTags } from './tags'

export interface DatabaseBootstrapResult {
  vectorReady: boolean
}

/**
 * Electron 打包后，原生扩展的 JS 入口仍在 app.asar 内，
 * 但 dylib / node 等二进制通常会被解包到 app.asar.unpacked。
 * loadExtension 只能加载真实文件，因此这里要优先切到 unpacked 副本。
 */
export function resolvePackagedExtensionPath(
  filePath: string,
  fileExists: (candidatePath: string) => boolean = existsSync,
): string {
  const unpackedPath = filePath.replace(/\.asar(?=[\\/])/, '.asar.unpacked')

  return unpackedPath !== filePath && fileExists(unpackedPath) ? unpackedPath : filePath
}

function getSqliteVecLoadablePath(): string {
  return resolvePackagedExtensionPath(sqliteVec.getLoadablePath())
}

function ensureColumn(db: Database.Database, tableName: string, columnName: string, sql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(sql)
  }
}

function migrateLegacyNotebookBlocks(db: Database.Database): void {
  const rows = db
    .prepare(
      `
        SELECT
          nb.notebook_id,
          nb.block_id,
          nb.sort_order,
          n.created_at,
          n.updated_at
        FROM notebook_blocks nb
        INNER JOIN notebooks n ON n.id = nb.notebook_id
        LEFT JOIN notebook_items ni
          ON ni.notebook_id = nb.notebook_id
          AND ni.type = 'block'
          AND ni.block_id = nb.block_id
        WHERE ni.id IS NULL
        ORDER BY nb.notebook_id ASC, nb.sort_order ASC, nb.block_id ASC
      `,
    )
    .all() as Array<{
    notebook_id: string
    block_id: string
    sort_order: number
    created_at: string
    updated_at: string
  }>

  if (rows.length === 0) {
    return
  }

  const insert = db.prepare(
    `
      INSERT INTO notebook_items (
        id,
        notebook_id,
        type,
        block_id,
        content,
        checked,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'block', ?, NULL, 0, ?, ?, ?)
    `,
  )

  const transaction = db.transaction(() => {
    for (const row of rows) {
      insert.run(uuid(), row.notebook_id, row.block_id, row.sort_order, row.created_at, row.updated_at)
    }
  })

  transaction()
}

function migrateNotebookItemsSchema(db: Database.Database): void {
  const row = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'notebook_items'
      `,
    )
    .get() as { sql: string } | undefined

  const normalizedSql = (row?.sql ?? '').replace(/\s+/g, ' ').toUpperCase()
  const hasTypeCheck = normalizedSql.includes(`CHECK (TYPE IN ('BLOCK', 'HEADING', 'DIVIDER', 'NOTE', 'TODO'))`)
  const hasCheckedCheck = normalizedSql.includes(`CHECK (CHECKED IN (0, 1))`)

  if (hasTypeCheck && hasCheckedCheck) {
    return
  }

  db.exec(`DROP INDEX IF EXISTS idx_notebook_items_notebook_id;`)
  db.exec(`DROP INDEX IF EXISTS idx_notebook_items_block_id;`)
  db.exec(`ALTER TABLE notebook_items RENAME TO notebook_items_legacy;`)
  db.exec(`
    CREATE TABLE notebook_items (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('block', 'heading', 'divider', 'note', 'todo')),
      block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
      content TEXT,
      checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const legacyRows = db
    .prepare(
      `
        SELECT id, notebook_id, type, block_id, content, checked, sort_order, created_at, updated_at
        FROM notebook_items_legacy
        ORDER BY notebook_id ASC, sort_order ASC, created_at ASC, id ASC
      `,
    )
    .all() as Array<{
    id: string
    notebook_id: string
    type: string
    block_id: string | null
    content: string | null
    checked: number
    sort_order: number
    created_at: string
    updated_at: string
  }>
  const hasBlock = db.prepare(`SELECT 1 FROM blocks WHERE id = ? LIMIT 1`)
  const insert = db.prepare(
    `
      INSERT INTO notebook_items (
        id,
        notebook_id,
        type,
        block_id,
        content,
        checked,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )

  const transaction = db.transaction(() => {
    for (const row of legacyRows) {
      const referencesExistingBlock = row.block_id ? Boolean(hasBlock.get(row.block_id)) : false
      const normalizedType =
        row.type === 'block' && referencesExistingBlock
          ? 'block'
          : row.type === 'heading' || row.type === 'divider' || row.type === 'note' || row.type === 'todo'
            ? row.type
            : referencesExistingBlock
              ? 'block'
              : 'note'

      insert.run(
        row.id,
        row.notebook_id,
        normalizedType,
        normalizedType === 'block' ? row.block_id : null,
        normalizedType === 'divider' || normalizedType === 'block' ? null : (row.content ?? ''),
        normalizedType === 'todo' && row.checked ? 1 : 0,
        row.sort_order,
        row.created_at,
        row.updated_at,
      )
    }
  })

  transaction()
  db.exec(`DROP TABLE notebook_items_legacy;`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notebook_items_notebook_id ON notebook_items (notebook_id, sort_order);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notebook_items_block_id ON notebook_items (block_id);`)
}

function migrateBlockAttachmentsSchema(db: Database.Database): void {
  const row = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'block_attachments'
      `,
    )
    .get() as { sql: string } | undefined

  const sql = row?.sql ?? ''

  if (!/PRIMARY KEY\s*\(\s*block_id\s*,\s*attachment_id\s*\)/i.test(sql)) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_block_attachments_block_id ON block_attachments (block_id, sort_order);`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_block_attachments_attachment_id ON block_attachments (attachment_id);`)
    return
  }

  db.exec(`ALTER TABLE block_attachments RENAME TO block_attachments_legacy;`)
  db.exec(`
    CREATE TABLE block_attachments (
      block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      alt_text TEXT,
      PRIMARY KEY (block_id, sort_order)
    );
  `)

  const legacyRows = db
    .prepare(
      `
        SELECT block_id AS blockId, attachment_id AS attachmentId, sort_order AS sortOrder, alt_text AS altText
        FROM block_attachments_legacy
        ORDER BY block_id ASC, sort_order ASC, attachment_id ASC
      `,
    )
    .all() as Array<{
    blockId: string
    attachmentId: string
    sortOrder: number
    altText: string | null
  }>

  const insert = db.prepare(
    `
      INSERT INTO block_attachments (block_id, attachment_id, sort_order, alt_text)
      VALUES (?, ?, ?, ?)
    `,
  )

  const transaction = db.transaction(() => {
    let lastBlockId: string | null = null
    let nextSortOrder = 0

    for (const row of legacyRows) {
      if (row.blockId !== lastBlockId) {
        lastBlockId = row.blockId
        nextSortOrder = 0
      }

      insert.run(row.blockId, row.attachmentId, nextSortOrder, row.altText)
      nextSortOrder += 1
    }
  })

  transaction()
  db.exec(`DROP TABLE block_attachments_legacy;`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_block_attachments_block_id ON block_attachments (block_id, sort_order);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_block_attachments_attachment_id ON block_attachments (attachment_id);`)
}

function migrateBlocksFtsSchema(db: Database.Database): void {
  const row = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'blocks_fts'
      `,
    )
    .get() as { sql: string } | undefined

  const sql = row?.sql ?? ''

  if (sql.includes('search_text')) {
    return
  }

  db.exec(`DROP TRIGGER IF EXISTS blocks_ai;`)
  db.exec(`DROP TRIGGER IF EXISTS blocks_ad;`)
  db.exec(`DROP TRIGGER IF EXISTS blocks_au;`)
  db.exec(`DROP TABLE IF EXISTS blocks_fts;`)
  db.exec(`
    CREATE VIRTUAL TABLE blocks_fts USING fts5(
      search_text,
      content='blocks',
      content_rowid='rowid',
      tokenize='trigram'
    );
  `)
  db.exec(`
    CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
      INSERT INTO blocks_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
    END;
  `)
  db.exec(`
    CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
      INSERT INTO blocks_fts(blocks_fts, rowid, search_text) VALUES ('delete', old.rowid, old.search_text);
    END;
  `)
  db.exec(`
    CREATE TRIGGER blocks_au AFTER UPDATE OF content, search_text ON blocks BEGIN
      INSERT INTO blocks_fts(blocks_fts, rowid, search_text) VALUES ('delete', old.rowid, old.search_text);
      INSERT INTO blocks_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
    END;
  `)
  db.exec(`INSERT INTO blocks_fts(rowid, search_text) SELECT rowid, search_text FROM blocks;`)
}

export function initializeDatabase(db: Database.Database): DatabaseBootstrapResult {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(baseMigrations)
  ensureColumn(db, 'blocks', 'summary', `ALTER TABLE blocks ADD COLUMN summary TEXT;`)
  ensureColumn(db, 'blocks', 'image_annotations', `ALTER TABLE blocks ADD COLUMN image_annotations TEXT;`)
  ensureColumn(db, 'blocks', 'search_text', `ALTER TABLE blocks ADD COLUMN search_text TEXT NOT NULL DEFAULT '';`)
  ensureColumn(db, 'blocks', 'error_code', `ALTER TABLE blocks ADD COLUMN error_code TEXT;`)
  db.exec(`UPDATE blocks SET search_text = content WHERE search_text IS NULL OR search_text = '';`)
  ensureColumn(db, 'tags', 'normalized_name', `ALTER TABLE tags ADD COLUMN normalized_name TEXT;`)
  ensureColumn(db, 'tags', 'kind', `ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'detail';`)
  ensureColumn(db, 'snapshots', 'notebook_id', `ALTER TABLE snapshots ADD COLUMN notebook_id TEXT;`)
  ensureColumn(db, 'snapshots', 'updated_at', `ALTER TABLE snapshots ADD COLUMN updated_at TEXT;`)
  db.exec(`UPDATE snapshots SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = '';`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_notebook_id ON snapshots (notebook_id);`)
  seedDefaultTags(db)
  migrateTagKinds(db)
  migrateNotebookItemsSchema(db)
  migrateLegacyNotebookBlocks(db)
  migrateBlockAttachmentsSchema(db)
  migrateBlocksFtsSchema(db)

  let vectorReady = false

  try {
    db.loadExtension(getSqliteVecLoadablePath())
    vectorReady = true
  } catch (error) {
    console.warn('[changbu] sqlite-vec unavailable, continuing without vector search.', error)
  }

  return { vectorReady }
}
