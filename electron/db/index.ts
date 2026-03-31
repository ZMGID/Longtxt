import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { v4 as uuid } from 'uuid'

import { baseMigrations } from './migrations'
import { migrateTagKinds, seedDefaultTags } from './tags'

export interface DatabaseBootstrapResult {
  vectorReady: boolean
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

export function initializeDatabase(db: Database.Database): DatabaseBootstrapResult {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(baseMigrations)
  ensureColumn(db, 'blocks', 'summary', `ALTER TABLE blocks ADD COLUMN summary TEXT;`)
  ensureColumn(db, 'tags', 'normalized_name', `ALTER TABLE tags ADD COLUMN normalized_name TEXT;`)
  ensureColumn(db, 'tags', 'kind', `ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'detail';`)
  ensureColumn(db, 'snapshots', 'notebook_id', `ALTER TABLE snapshots ADD COLUMN notebook_id TEXT;`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_notebook_id ON snapshots (notebook_id);`)
  seedDefaultTags(db)
  migrateTagKinds(db)
  migrateLegacyNotebookBlocks(db)

  let vectorReady = false

  try {
    db.loadExtension(sqliteVec.getLoadablePath())
    vectorReady = true
  } catch (error) {
    console.warn('[changbu] sqlite-vec unavailable, continuing without vector search.', error)
  }

  return { vectorReady }
}
