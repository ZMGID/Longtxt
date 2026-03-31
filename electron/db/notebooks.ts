import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type {
  Notebook,
  NotebookBlockItem,
  NotebookItem,
  NotebookItemType,
  NotebookMutationResult,
  NotebookReferenceReviewState,
  NotebookStructureItemInput,
  NotebookStructureItemPatch,
  NotebookSummary,
} from '../../shared/types'
import { getBlocksByIds } from './blocks'

interface NotebookSummaryRow {
  id: string
  title: string
  created_at: string
  updated_at: string
  item_count: number
  block_count: number
  structure_count: number
}

interface NotebookItemRow {
  id: string
  notebook_id: string
  type: NotebookItemType
  block_id: string | null
  content: string | null
  checked: number
  sort_order: number
  created_at: string
  updated_at: string
}

interface NotebookReferenceReviewRow {
  notebook_id: string
  block_id: string
  excluded: number
  locked: number
  pinned: number
  updated_at: string
}

interface NotebookRecordInput {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface NotebookBlockEntry {
  itemId: string
  blockId: string
  sortOrder: number
  block: NotebookBlockItem['block']
}

function toNotebookSummary(row: NotebookSummaryRow): NotebookSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: row.item_count,
    blockCount: row.block_count,
    structureCount: row.structure_count,
  }
}

function getNotebookSummaryQuery(): string {
  return `
    SELECT
      n.id,
      n.title,
      n.created_at,
      n.updated_at,
      COUNT(ni.id) AS item_count,
      SUM(CASE WHEN ni.type = 'block' THEN 1 ELSE 0 END) AS block_count,
      SUM(CASE WHEN ni.type != 'block' THEN 1 ELSE 0 END) AS structure_count
    FROM notebooks n
    LEFT JOIN notebook_items ni ON ni.notebook_id = n.id
  `
}

function getNotebookSummaryById(db: Database.Database, id: string): NotebookSummary {
  const row = db
    .prepare(
      `
        ${getNotebookSummaryQuery()}
        WHERE n.id = ?
        GROUP BY n.id
      `,
    )
    .get(id) as NotebookSummaryRow | undefined

  if (!row) {
    throw new Error(`Notebook ${id} not found`)
  }

  return toNotebookSummary({
    ...row,
    item_count: row.item_count ?? 0,
    block_count: row.block_count ?? 0,
    structure_count: row.structure_count ?? 0,
  })
}

export function ensureNotebookExists(db: Database.Database, id: string): void {
  getNotebookSummaryById(db, id)
}

function listNotebookItemRows(db: Database.Database, notebookId: string): NotebookItemRow[] {
  return db
    .prepare(
      `
        SELECT id, notebook_id, type, block_id, content, checked, sort_order, created_at, updated_at
        FROM notebook_items
        WHERE notebook_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `,
    )
    .all(notebookId) as NotebookItemRow[]
}

function resequenceNotebookItems(db: Database.Database, notebookId: string, orderedItemIds: string[]): void {
  const update = db.prepare(
    `
      UPDATE notebook_items
      SET sort_order = ?
      WHERE notebook_id = ? AND id = ?
    `,
  )

  for (const [index, itemId] of orderedItemIds.entries()) {
    update.run(index, notebookId, itemId)
  }
}

function touchNotebook(db: Database.Database, notebookId: string, updatedAt: string): void {
  db.prepare(`UPDATE notebooks SET updated_at = ? WHERE id = ?`).run(updatedAt, notebookId)
}

function nextNotebookSortOrder(db: Database.Database, notebookId: string): number {
  const row = db
    .prepare(
      `
        SELECT COALESCE(MAX(sort_order) + 1, 0) AS next_sort_order
        FROM notebook_items
        WHERE notebook_id = ?
      `,
    )
    .get(notebookId) as { next_sort_order: number }

  return row.next_sort_order
}

function rowToNotebookItem(row: NotebookItemRow, blockEntries: Map<string, NotebookBlockItem['block']>): NotebookItem | null {
  const base = {
    id: row.id,
    type: row.type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as const

  switch (row.type) {
    case 'block': {
      const block = row.block_id ? blockEntries.get(row.block_id) : null

      if (!row.block_id || !block) {
        return null
      }

      return {
        ...base,
        type: 'block',
        blockId: row.block_id,
        block,
      }
    }
    case 'heading':
      return {
        ...base,
        type: 'heading',
        content: row.content ?? '',
      }
    case 'divider':
      return {
        ...base,
        type: 'divider',
      }
    case 'note':
      return {
        ...base,
        type: 'note',
        content: row.content ?? '',
      }
    case 'todo':
      return {
        ...base,
        type: 'todo',
        content: row.content ?? '',
        checked: Boolean(row.checked),
      }
    default:
      return null
  }
}

function hydrateNotebookItems(db: Database.Database, notebookId: string): NotebookItem[] {
  const rows = listNotebookItemRows(db, notebookId)
  const blockIds = rows
    .filter((row) => row.type === 'block' && row.block_id)
    .map((row) => row.block_id as string)
  const blocks = getBlocksByIds(db, blockIds)
  const blockMap = new Map(blocks.map((block) => [block.id, block]))

  return rows
    .map((row) => rowToNotebookItem(row, blockMap))
    .filter((item): item is NotebookItem => Boolean(item))
}

export function createNotebookRecord(db: Database.Database, input: NotebookRecordInput): Notebook {
  db.prepare(
    `
      INSERT INTO notebooks (id, title, created_at, updated_at)
      VALUES (@id, @title, @createdAt, @updatedAt)
    `,
  ).run(input)

  return getNotebookById(db, input.id)
}

export function listNotebooks(db: Database.Database): NotebookSummary[] {
  const rows = db
    .prepare(
      `
        ${getNotebookSummaryQuery()}
        GROUP BY n.id
        ORDER BY n.updated_at DESC, n.created_at DESC, n.title COLLATE NOCASE ASC
      `,
    )
    .all() as NotebookSummaryRow[]

  return rows.map((row) =>
    toNotebookSummary({
      ...row,
      item_count: row.item_count ?? 0,
      block_count: row.block_count ?? 0,
      structure_count: row.structure_count ?? 0,
    }),
  )
}

export function getNotebookById(db: Database.Database, id: string): Notebook {
  const summary = getNotebookSummaryById(db, id)

  return {
    ...summary,
    items: hydrateNotebookItems(db, id),
  }
}

export function updateNotebookTitle(db: Database.Database, id: string, title: string, updatedAt: string): Notebook {
  db.prepare(
    `
      UPDATE notebooks
      SET title = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(title, updatedAt, id)

  return getNotebookById(db, id)
}

export function deleteNotebookRecord(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM notebooks WHERE id = ?`).run(id)
}

export function appendBlockToNotebook(
  db: Database.Database,
  notebookId: string,
  blockId: string,
  updatedAt: string,
): boolean {
  const existing = db
    .prepare(
      `
        SELECT id
        FROM notebook_items
        WHERE notebook_id = ?
          AND type = 'block'
          AND block_id = ?
      `,
    )
    .get(notebookId, blockId) as { id: string } | undefined

  if (existing) {
    return false
  }

  db.prepare(
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
  ).run(uuid(), notebookId, blockId, nextNotebookSortOrder(db, notebookId), updatedAt, updatedAt)

  touchNotebook(db, notebookId, updatedAt)
  return true
}

export function addBlockToNotebook(
  db: Database.Database,
  notebookId: string,
  blockId: string,
  updatedAt: string,
): NotebookMutationResult {
  ensureNotebookExists(db, notebookId)

  const transaction = db.transaction(() => appendBlockToNotebook(db, notebookId, blockId, updatedAt))
  const added = transaction()

  return {
    notebook: getNotebookById(db, notebookId),
    added,
  }
}

export function createNotebookStructureItem(
  db: Database.Database,
  notebookId: string,
  input: NotebookStructureItemInput,
  updatedAt: string,
): Notebook {
  ensureNotebookExists(db, notebookId)

  db.prepare(
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
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `,
  ).run(
    uuid(),
    notebookId,
    input.type,
    input.type === 'divider' ? null : (input.content?.trim() ?? ''),
    input.type === 'todo' && input.checked ? 1 : 0,
    nextNotebookSortOrder(db, notebookId),
    updatedAt,
    updatedAt,
  )

  touchNotebook(db, notebookId, updatedAt)
  return getNotebookById(db, notebookId)
}

export function updateNotebookStructureItem(
  db: Database.Database,
  notebookId: string,
  itemId: string,
  patch: NotebookStructureItemPatch,
  updatedAt: string,
): Notebook {
  ensureNotebookExists(db, notebookId)

  const current = db
    .prepare(
      `
        SELECT id, notebook_id, type, block_id, content, checked, sort_order, created_at, updated_at
        FROM notebook_items
        WHERE notebook_id = ? AND id = ?
      `,
    )
    .get(notebookId, itemId) as NotebookItemRow | undefined

  if (!current) {
    throw new Error(`Notebook item ${itemId} not found`)
  }

  if (current.type === 'block') {
    throw new Error('Block 类型不能通过结构块接口更新。')
  }

  db.prepare(
    `
      UPDATE notebook_items
      SET
        content = ?,
        checked = ?,
        updated_at = ?
      WHERE notebook_id = ? AND id = ?
    `,
  ).run(
    current.type === 'divider'
      ? null
      : patch.content != null
        ? patch.content.trim()
        : current.content,
    current.type === 'todo'
      ? patch.checked != null
        ? Number(patch.checked)
        : current.checked
      : current.checked,
    updatedAt,
    notebookId,
    itemId,
  )

  touchNotebook(db, notebookId, updatedAt)
  return getNotebookById(db, notebookId)
}

export function removeItemFromNotebook(db: Database.Database, notebookId: string, itemId: string, updatedAt: string): Notebook {
  ensureNotebookExists(db, notebookId)

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM notebook_items WHERE notebook_id = ? AND id = ?`).run(notebookId, itemId)
    const remainingIds = listNotebookItemRows(db, notebookId).map((row) => row.id)
    resequenceNotebookItems(db, notebookId, remainingIds)
    touchNotebook(db, notebookId, updatedAt)
  })

  transaction()

  return getNotebookById(db, notebookId)
}

export function reorderNotebookItems(
  db: Database.Database,
  notebookId: string,
  orderedItemIds: string[],
  updatedAt: string,
): Notebook {
  ensureNotebookExists(db, notebookId)

  const transaction = db.transaction(() => {
    const currentIds = listNotebookItemRows(db, notebookId).map((row) => row.id)
    const currentIdSet = new Set(currentIds)
    const nextIds: string[] = []

    for (const itemId of orderedItemIds) {
      if (currentIdSet.has(itemId) && !nextIds.includes(itemId)) {
        nextIds.push(itemId)
      }
    }

    for (const itemId of currentIds) {
      if (!nextIds.includes(itemId)) {
        nextIds.push(itemId)
      }
    }

    resequenceNotebookItems(db, notebookId, nextIds)
    touchNotebook(db, notebookId, updatedAt)
  })

  transaction()

  return getNotebookById(db, notebookId)
}

export function listNotebookBlockEntries(db: Database.Database, notebookId: string): NotebookBlockEntry[] {
  return hydrateNotebookItems(db, notebookId)
    .filter((item): item is NotebookBlockItem => item.type === 'block')
    .map((item) => ({
      itemId: item.id,
      blockId: item.blockId,
      sortOrder: item.sortOrder,
      block: item.block,
    }))
}

export function touchNotebooksForBlock(db: Database.Database, blockId: string, updatedAt: string): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT notebook_id FROM notebook_items WHERE block_id = ?`)
    .all(blockId) as Array<{ notebook_id: string }>

  if (rows.length === 0) {
    return []
  }

  const notebookIds = rows.map((row) => row.notebook_id)
  const update = db.prepare(`UPDATE notebooks SET updated_at = ? WHERE id = ?`)

  for (const notebookId of notebookIds) {
    update.run(updatedAt, notebookId)
  }

  return notebookIds
}

function defaultReviewState(blockId: string): NotebookReferenceReviewState {
  return {
    blockId,
    excluded: false,
    locked: false,
    pinned: false,
    updatedAt: null,
  }
}

export function listNotebookReferenceReviews(db: Database.Database, notebookId: string): NotebookReferenceReviewState[] {
  const rows = db
    .prepare(
      `
        SELECT notebook_id, block_id, excluded, locked, pinned, updated_at
        FROM notebook_reference_reviews
        WHERE notebook_id = ?
      `,
    )
    .all(notebookId) as NotebookReferenceReviewRow[]

  return rows.map((row) => ({
    blockId: row.block_id,
    excluded: Boolean(row.excluded),
    locked: Boolean(row.locked),
    pinned: Boolean(row.pinned),
    updatedAt: row.updated_at,
  }))
}

export function updateNotebookReferenceReview(
  db: Database.Database,
  notebookId: string,
  blockId: string,
  patch: Partial<Pick<NotebookReferenceReviewState, 'excluded' | 'locked' | 'pinned'>>,
  updatedAt: string,
): NotebookReferenceReviewState {
  ensureNotebookExists(db, notebookId)

  const exists = db
    .prepare(
      `
        SELECT id
        FROM notebook_items
        WHERE notebook_id = ?
          AND type = 'block'
          AND block_id = ?
      `,
    )
    .get(notebookId, blockId) as { id: string } | undefined

  if (!exists) {
    throw new Error('只能审核当前笔记本里的引用块。')
  }

  const current = listNotebookReferenceReviews(db, notebookId).find((item) => item.blockId === blockId) ?? defaultReviewState(blockId)
  const next = {
    blockId,
    excluded: patch.excluded ?? current.excluded,
    locked: patch.locked ?? current.locked,
    pinned: patch.pinned ?? current.pinned,
    updatedAt,
  }

  if (!next.excluded && !next.locked && !next.pinned) {
    db.prepare(
      `
        DELETE FROM notebook_reference_reviews
        WHERE notebook_id = ? AND block_id = ?
      `,
    ).run(notebookId, blockId)

    return defaultReviewState(blockId)
  }

  db.prepare(
    `
      INSERT INTO notebook_reference_reviews (
        notebook_id,
        block_id,
        excluded,
        locked,
        pinned,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(notebook_id, block_id) DO UPDATE SET
        excluded = excluded.excluded,
        locked = excluded.locked,
        pinned = excluded.pinned,
        updated_at = excluded.updated_at
    `,
  ).run(notebookId, blockId, Number(next.excluded), Number(next.locked), Number(next.pinned), updatedAt)

  touchNotebook(db, notebookId, updatedAt)
  return next
}
