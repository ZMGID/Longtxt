import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { Snapshot } from '../../shared/types'

function mapSnapshotRow(row: { id: string; topic: string; content: string; block_ids: string; created_at: string }): Snapshot {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    blockIds: JSON.parse(row.block_ids) as string[],
    createdAt: row.created_at,
  }
}

export function createSnapshot(db: Database.Database, topic: string, content: string, blockIds: string[]): Snapshot {
  const row = {
    id: uuid(),
    topic,
    content,
    block_ids: JSON.stringify(blockIds),
    created_at: new Date().toISOString(),
  }

  db.prepare(
    `
      INSERT INTO snapshots (id, topic, content, block_ids, created_at)
      VALUES (@id, @topic, @content, @block_ids, @created_at)
    `,
  ).run(row)

  return mapSnapshotRow(row)
}

export function listSnapshots(db: Database.Database, query = ''): Snapshot[] {
  const normalizedQuery = query.trim()

  const rows = normalizedQuery
    ? (db
        .prepare(
          `
            SELECT id, topic, content, block_ids, created_at
            FROM snapshots
            WHERE topic LIKE ?
            ORDER BY created_at DESC
          `,
        )
        .all(`%${normalizedQuery}%`) as Array<{
        id: string
        topic: string
        content: string
        block_ids: string
        created_at: string
      }>)
    : (db
        .prepare(
          `
            SELECT id, topic, content, block_ids, created_at
            FROM snapshots
            ORDER BY created_at DESC
          `,
        )
        .all() as Array<{
        id: string
        topic: string
        content: string
        block_ids: string
        created_at: string
      }>)

  return rows.map(mapSnapshotRow)
}

export function getSnapshot(db: Database.Database, id: string): Snapshot {
  const row = db
    .prepare(
      `
        SELECT id, topic, content, block_ids, created_at
        FROM snapshots
        WHERE id = ?
      `,
    )
    .get(id) as { id: string; topic: string; content: string; block_ids: string; created_at: string } | undefined

  if (!row) {
    throw new Error('快照不存在。')
  }

  return mapSnapshotRow(row)
}

export function removeSnapshot(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM snapshots WHERE id = ?`).run(id)
}
