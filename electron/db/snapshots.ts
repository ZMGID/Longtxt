import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { Snapshot } from '../../shared/types'

interface SnapshotRow {
  id: string
  topic: string
  content: string
  block_ids: string
  notebook_id: string | null
  notebook_title: string | null
  created_at: string
}

function mapSnapshotRow(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    blockIds: JSON.parse(row.block_ids) as string[],
    notebookId: row.notebook_id,
    notebookTitle: row.notebook_title,
    createdAt: row.created_at,
  }
}

export function createSnapshot(
  db: Database.Database,
  topic: string,
  content: string,
  blockIds: string[],
  notebookId?: string | null,
): Snapshot {
  const row = {
    id: uuid(),
    topic,
    content,
    block_ids: JSON.stringify(blockIds),
    notebook_id: notebookId ?? null,
    created_at: new Date().toISOString(),
  }

  db.prepare(
    `
      INSERT INTO snapshots (id, topic, content, block_ids, notebook_id, created_at)
      VALUES (@id, @topic, @content, @block_ids, @notebook_id, @created_at)
    `,
  ).run(row)

  return mapSnapshotRow({
    ...row,
    notebook_title: (notebookId
      ? ((db.prepare(`SELECT title FROM notebooks WHERE id = ?`).get(notebookId) as { title: string } | undefined)?.title ?? null)
      : null),
  })
}

export function listSnapshots(db: Database.Database, query = '', notebookId?: string | null): Snapshot[] {
  const normalizedQuery = query.trim()
  const clauses: string[] = []
  const params: Array<string> = []

  if (normalizedQuery) {
    clauses.push(`s.topic LIKE ?`)
    params.push(`%${normalizedQuery}%`)
  }

  if (notebookId === null) {
    clauses.push(`s.notebook_id IS NULL`)
  } else if (typeof notebookId === 'string' && notebookId.trim()) {
    clauses.push(`s.notebook_id = ?`)
    params.push(notebookId)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `
        SELECT
          s.id,
          s.topic,
          s.content,
          s.block_ids,
          s.notebook_id,
          n.title AS notebook_title,
          s.created_at
        FROM snapshots s
        LEFT JOIN notebooks n ON n.id = s.notebook_id
        ${whereClause}
        ORDER BY s.created_at DESC
      `,
    )
    .all(...params) as SnapshotRow[]

  return rows.map(mapSnapshotRow)
}

export function getSnapshot(db: Database.Database, id: string): Snapshot {
  const row = db
    .prepare(
      `
        SELECT
          s.id,
          s.topic,
          s.content,
          s.block_ids,
          s.notebook_id,
          n.title AS notebook_title,
          s.created_at
        FROM snapshots s
        LEFT JOIN notebooks n ON n.id = s.notebook_id
        WHERE s.id = ?
      `,
    )
    .get(id) as SnapshotRow | undefined

  if (!row) {
    throw new Error('快照不存在。')
  }

  return mapSnapshotRow(row)
}

export function removeSnapshot(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM snapshots WHERE id = ?`).run(id)
}
