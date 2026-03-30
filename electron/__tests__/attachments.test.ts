// @vitest-environment node

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { createAppContext, type AppContext } from '../appContext'

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
})
