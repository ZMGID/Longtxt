// @vitest-environment node

import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { initializeDatabase } from '../db'
import { baseMigrations } from '../db/migrations'

const directories: string[] = []

function makeDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-db-init-'))
  directories.push(directory)
  return join(directory, 'changbu.sqlite3')
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('database bootstrap', () => {
  it('migrates legacy notebook_items rows into checked, visible item types', () => {
    const db = new Database(makeDbPath())

    db.exec(baseMigrations)
    db.exec(`DROP INDEX IF EXISTS idx_notebook_items_notebook_id;`)
    db.exec(`DROP INDEX IF EXISTS idx_notebook_items_block_id;`)
    db.exec(`DROP TABLE notebook_items;`)
    db.exec(`
      CREATE TABLE notebook_items (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
        content TEXT,
        checked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    db.exec(`CREATE INDEX idx_notebook_items_notebook_id ON notebook_items (notebook_id, sort_order);`)
    db.exec(`CREATE INDEX idx_notebook_items_block_id ON notebook_items (block_id);`)

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO notebooks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('notebook-1', '旧数据', now, now)
    db.prepare(`INSERT INTO blocks (id, content, status, ai_mode, created_at, updated_at) VALUES (?, ?, 'ready', 'mock', ?, ?)`)
      .run('block-1', '旧块内容', now, now)
    db.prepare(
      `
        INSERT INTO notebook_items (id, notebook_id, type, block_id, content, checked, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run('item-invalid', 'notebook-1', 'mystery', null, '遗留结构项', 7, 0, now, now)
    db.prepare(
      `
        INSERT INTO notebook_items (id, notebook_id, type, block_id, content, checked, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run('item-block', 'notebook-1', 'block', 'block-1', '不会保留到 block content', 0, 1, now, now)

    initializeDatabase(db)

    const tableSql = db
      .prepare(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'notebook_items'
        `,
      )
      .get() as { sql: string }

    expect(tableSql.sql).toContain(`CHECK (type IN ('block', 'heading', 'divider', 'note', 'todo'))`)

    const rows = db
      .prepare(
        `
          SELECT id, type, block_id AS blockId, content, checked
          FROM notebook_items
          ORDER BY sort_order ASC
        `,
      )
      .all() as Array<{ id: string; type: string; blockId: string | null; content: string | null; checked: number }>

    expect(rows).toEqual([
      {
        id: 'item-invalid',
        type: 'note',
        blockId: null,
        content: '遗留结构项',
        checked: 0,
      },
      {
        id: 'item-block',
        type: 'block',
        blockId: 'block-1',
        content: null,
        checked: 0,
      },
    ])

    db.close()
  })
})
