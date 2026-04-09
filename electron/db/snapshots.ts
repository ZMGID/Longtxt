import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { Snapshot, SnapshotUpdateInput, Tag, TagKind, TagSource } from '../../shared/types'

interface SnapshotRow {
  id: string
  topic: string
  content: string
  block_ids: string
  notebook_id: string | null
  notebook_title: string | null
  created_at: string
  updated_at: string
}

interface SnapshotBlockTagRow {
  block_id: string
  tag_id: string
  tag_name: string
  tag_is_default: number
  tag_kind: TagKind
  tag_source: TagSource
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
    updatedAt: row.updated_at,
  }
}

function compareSnapshotTags(left: Tag, right: Tag): number {
  if (left.isDefault !== right.isDefault) {
    return Number(left.isDefault) - Number(right.isDefault)
  }

  const kindRank = { user: 0, detail: 1, category: 2 }
  if (kindRank[left.kind] !== kindRank[right.kind]) {
    return kindRank[left.kind] - kindRank[right.kind]
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

function hydrateSnapshotTags(db: Database.Database, snapshots: Snapshot[]): Snapshot[] {
  const blockToSnapshotIds = new Map<string, string[]>()

  for (const snapshot of snapshots) {
    for (const blockId of snapshot.blockIds) {
      const current = blockToSnapshotIds.get(blockId) ?? []
      current.push(snapshot.id)
      blockToSnapshotIds.set(blockId, current)
    }
  }

  const blockIds = Array.from(blockToSnapshotIds.keys())
  if (blockIds.length === 0) {
    return snapshots
  }

  const rows = db
    .prepare(
      `
        SELECT
          bt.block_id,
          t.id AS tag_id,
          t.name AS tag_name,
          t.is_default AS tag_is_default,
          t.kind AS tag_kind,
          bt.source AS tag_source
        FROM block_tags bt
        INNER JOIN tags t ON t.id = bt.tag_id
        WHERE bt.block_id IN (${blockIds.map(() => '?').join(', ')})
        ORDER BY t.name COLLATE NOCASE ASC
      `,
    )
    .all(...blockIds) as SnapshotBlockTagRow[]

  const snapshotTagsMap = new Map<string, Map<string, Tag>>()

  for (const row of rows) {
    const snapshotIds = blockToSnapshotIds.get(row.block_id) ?? []

    for (const snapshotId of snapshotIds) {
      const tags = snapshotTagsMap.get(snapshotId) ?? new Map<string, Tag>()

      tags.set(row.tag_name, {
        id: row.tag_id,
        name: row.tag_name,
        isDefault: Boolean(row.tag_is_default),
        kind: row.tag_kind,
        source: row.tag_source,
      })

      snapshotTagsMap.set(snapshotId, tags)
    }
  }

  return snapshots.map((snapshot) => ({
    ...snapshot,
    tags: Array.from(snapshotTagsMap.get(snapshot.id)?.values() ?? []).sort(compareSnapshotTags),
  }))
}

export function createSnapshot(
  db: Database.Database,
  topic: string,
  content: string,
  blockIds: string[],
  notebookId?: string | null,
): Snapshot {
  const createdAt = new Date().toISOString()
  const row = {
    id: uuid(),
    topic,
    content,
    block_ids: JSON.stringify(blockIds),
    notebook_id: notebookId ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  }

  db.prepare(
    `
      INSERT INTO snapshots (id, topic, content, block_ids, notebook_id, created_at, updated_at)
      VALUES (@id, @topic, @content, @block_ids, @notebook_id, @created_at, @updated_at)
    `,
  ).run(row)

  return hydrateSnapshotTags(db, [
    mapSnapshotRow({
      ...row,
      notebook_title: (notebookId
        ? ((db.prepare(`SELECT title FROM notebooks WHERE id = ?`).get(notebookId) as { title: string } | undefined)?.title ?? null)
        : null),
    }),
  ])[0]!
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
          s.created_at,
          s.updated_at
        FROM snapshots s
        LEFT JOIN notebooks n ON n.id = s.notebook_id
        ${whereClause}
        ORDER BY s.created_at DESC
      `,
    )
    .all(...params) as SnapshotRow[]

  return hydrateSnapshotTags(db, rows.map(mapSnapshotRow))
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
          s.created_at,
          s.updated_at
        FROM snapshots s
        LEFT JOIN notebooks n ON n.id = s.notebook_id
        WHERE s.id = ?
      `,
    )
    .get(id) as SnapshotRow | undefined

  if (!row) {
    throw new Error('快照不存在。')
  }

  return hydrateSnapshotTags(db, [mapSnapshotRow(row)])[0]!
}

export function updateSnapshot(
  db: Database.Database,
  id: string,
  patch: SnapshotUpdateInput,
  updatedAt: string,
): Snapshot {
  const result = db.prepare(
    `
      UPDATE snapshots
      SET topic = @topic,
          content = @content,
          updated_at = @updated_at
      WHERE id = @id
    `,
  ).run({
    id,
    topic: patch.topic,
    content: patch.content,
    updated_at: updatedAt,
  })

  if (result.changes === 0) {
    throw new Error('快照不存在。')
  }

  return getSnapshot(db, id)
}

export function removeSnapshot(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM snapshots WHERE id = ?`).run(id)
}
