// @vitest-environment node

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { createAppContext, type AppContext } from '../appContext'
import { initializeDatabase } from '../db'
import { baseMigrations } from '../db/migrations'

const contexts: AppContext[] = []
const directories: string[] = []
const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnXl6QAAAAASUVORK5CYII='

function makeContext(): AppContext {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-attachments-'))
  directories.push(directory)

  const context = createAppContext({
    dataDirectory: directory,
    openPath: async () => '',
  })

  contexts.push(context)
  return context
}

function openDb(directory: string): Database.Database {
  return new Database(join(directory, 'changbu.sqlite3'))
}

afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.dispose()
  }

  while (directories.length > 0) {
    const directory = directories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('attachments', () => {
  it('tracks saved images in attachment tables and deletes orphaned files when removed from a block', async () => {
    const context = makeContext()
    const directory = directories[directories.length - 1]
    const db = openDb(directory)
    const saved = await context.saveImage(ONE_BY_ONE_PNG, 'note-image.png')
    const localPath = fileURLToPath(saved.fileUrl)

    expect(existsSync(localPath)).toBe(true)

    const savedAttachmentRow = db
      .prepare(`SELECT COUNT(*) AS total FROM attachments WHERE file_url = ?`)
      .get(saved.fileUrl) as { total: number }
    expect(savedAttachmentRow.total).toBe(1)

    const block = await context.createBlock(`第一段\n\n![${saved.markdownAlt}](${saved.fileUrl})`)
    await context.whenIdle()

    const linkedAttachmentRows = db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM block_attachments ba
          INNER JOIN attachments a ON a.id = ba.attachment_id
          WHERE ba.block_id = ? AND a.file_url = ?
        `,
      )
      .get(block.id, saved.fileUrl) as { total: number }
    expect(linkedAttachmentRows.total).toBe(1)

    await context.updateBlock(block.id, '第一段\n\n第二段')
    await context.whenIdle()

    expect(existsSync(localPath)).toBe(false)

    const remainingAttachments = db.prepare(`SELECT COUNT(*) AS total FROM attachments`).get() as { total: number }
    const remainingLinks = db.prepare(`SELECT COUNT(*) AS total FROM block_attachments`).get() as { total: number }
    expect(remainingAttachments.total).toBe(0)
    expect(remainingLinks.total).toBe(0)

    db.close()
  })

  it('does not treat sibling directories with a shared prefix as managed attachments', async () => {
    const context = makeContext()
    const directory = directories[directories.length - 1]
    const db = openDb(directory)
    const outsideDirectory = join(directory, 'attachments_backup')
    const outsidePath = join(outsideDirectory, 'outside.png')
    const outsideUrl = pathToFileURL(outsidePath).toString()

    mkdirSync(outsideDirectory, { recursive: true })
    writeFileSync(outsidePath, Buffer.from('outside-file'))

    const block = await context.createBlock(`记录一条外部图片引用\n\n![outside](${outsideUrl})`)
    await context.whenIdle()

    const attachmentCount = db.prepare(`SELECT COUNT(*) AS total FROM attachments`).get() as { total: number }
    expect(attachmentCount.total).toBe(0)
    expect(existsSync(outsidePath)).toBe(true)

    await context.updateBlock(block.id, '外部图片引用已经移除')
    await context.whenIdle()

    expect(existsSync(outsidePath)).toBe(true)
    db.close()
  })

  it('allows the same managed attachment to appear multiple times in one block', async () => {
    const context = makeContext()
    const directory = directories[directories.length - 1]
    const db = openDb(directory)
    const saved = await context.saveImage(ONE_BY_ONE_PNG, 'duplicate.png')

    const block = await context.createBlock(`第一处引用 ![图一](${saved.fileUrl})\n\n第二处引用 ![图二](${saved.fileUrl})`)
    await context.whenIdle()

    const rows = db
      .prepare(
        `
          SELECT sort_order AS sortOrder, alt_text AS altText
          FROM block_attachments
          WHERE block_id = ?
          ORDER BY sort_order ASC
        `,
      )
      .all(block.id) as Array<{ sortOrder: number; altText: string | null }>

    expect(rows).toEqual([
      { sortOrder: 0, altText: '图一' },
      { sortOrder: 1, altText: '图二' },
    ])

    db.close()
  })

  it('migrates legacy attachment links so duplicate references can be stored after bootstrap', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changbu-attachments-migrate-'))
    directories.push(directory)
    const db = openDb(directory)

    db.exec(baseMigrations)
    db.exec(`DROP INDEX IF EXISTS idx_block_attachments_block_id;`)
    db.exec(`DROP INDEX IF EXISTS idx_block_attachments_attachment_id;`)
    db.exec(`DROP TABLE block_attachments;`)
    db.exec(`
      CREATE TABLE block_attachments (
        block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        alt_text TEXT,
        PRIMARY KEY (block_id, attachment_id)
      );
    `)
    db.exec(`CREATE INDEX idx_block_attachments_block_id ON block_attachments (block_id);`)
    db.exec(`CREATE INDEX idx_block_attachments_attachment_id ON block_attachments (attachment_id);`)

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO blocks (id, content, status, ai_mode, created_at, updated_at) VALUES (?, ?, 'ready', 'mock', ?, ?)`)
      .run('block-legacy', 'legacy', now, now)
    db.prepare(
      `
        INSERT INTO attachments (id, file_url, file_path, mime_type, filename, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run('attachment-1', 'file:///tmp/legacy.png', '/tmp/legacy.png', 'image/png', 'legacy.png', now, now)
    db.prepare(
      `
        INSERT INTO block_attachments (block_id, attachment_id, sort_order, alt_text)
        VALUES (?, ?, ?, ?)
      `,
    ).run('block-legacy', 'attachment-1', 0, '旧引用')

    initializeDatabase(db)

    db.prepare(
      `
        INSERT INTO block_attachments (block_id, attachment_id, sort_order, alt_text)
        VALUES (?, ?, ?, ?)
      `,
    ).run('block-legacy', 'attachment-1', 1, '新引用')

    const rows = db
      .prepare(
        `
          SELECT sort_order AS sortOrder, alt_text AS altText
          FROM block_attachments
          WHERE block_id = ?
          ORDER BY sort_order ASC
        `,
      )
      .all('block-legacy') as Array<{ sortOrder: number; altText: string | null }>

    expect(rows).toEqual([
      { sortOrder: 0, altText: '旧引用' },
      { sortOrder: 1, altText: '新引用' },
    ])

    db.close()
  })
})
