import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

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

export function initializeDatabase(db: Database.Database): DatabaseBootstrapResult {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(baseMigrations)
  ensureColumn(db, 'blocks', 'summary', `ALTER TABLE blocks ADD COLUMN summary TEXT;`)
  ensureColumn(db, 'tags', 'normalized_name', `ALTER TABLE tags ADD COLUMN normalized_name TEXT;`)
  ensureColumn(db, 'tags', 'kind', `ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'detail';`)
  seedDefaultTags(db)
  migrateTagKinds(db)

  let vectorReady = false

  try {
    db.loadExtension(sqliteVec.getLoadablePath())
    vectorReady = true
  } catch (error) {
    console.warn('[changbu] sqlite-vec unavailable, continuing without vector search.', error)
  }

  return { vectorReady }
}
