import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { TagKind, TagSuggestion } from '../../shared/types'
import { CATEGORY_TAG_NAMES, DEFAULT_TAG_DEFINITIONS, DEFAULT_TAG_NAMES } from '../services/defaultTags'

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function selectTagsByNames(db: Database.Database, names: string[]): TagSuggestion[] {
  if (names.length === 0) {
    return []
  }

  const placeholders = names.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
        SELECT id, name, is_default, kind
        FROM tags
        WHERE normalized_name IN (${placeholders})
        ORDER BY name ASC
      `,
    )
    .all(...names.map(normalizeTagName)) as Array<{ id: string; name: string; is_default: number; kind: TagKind }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.is_default),
    kind: row.kind,
  }))
}

export function seedDefaultTags(db: Database.Database): void {
  const transaction = db.transaction(() => {
    const insertCategory = db.prepare(
      `
        INSERT OR IGNORE INTO tags (id, name, normalized_name, is_default, kind, created_at)
        VALUES (?, ?, ?, 1, 'category', ?)
      `,
    )
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO tags (id, name, normalized_name, is_default, kind, created_at)
        VALUES (?, ?, ?, 1, 'detail', ?)
      `,
    )
    const now = new Date().toISOString()

    for (const name of CATEGORY_TAG_NAMES) {
      insertCategory.run(uuid(), name, normalizeTagName(name), now)
    }

    for (const definition of DEFAULT_TAG_DEFINITIONS) {
      insert.run(uuid(), definition.name, normalizeTagName(definition.name), now)
    }
  })

  transaction()
}

export function migrateTagKinds(db: Database.Database): void {
  db.exec(`
    UPDATE tags
    SET normalized_name = lower(trim(name))
    WHERE normalized_name IS NULL OR normalized_name = '';

    UPDATE tags
    SET kind = 'category'
    WHERE normalized_name IN (${CATEGORY_TAG_NAMES.map((name) => `'${normalizeTagName(name)}'`).join(', ')});

    UPDATE tags
    SET kind = 'detail'
    WHERE (kind IS NULL OR kind = '')
      AND normalized_name NOT IN (${CATEGORY_TAG_NAMES.map((name) => `'${normalizeTagName(name)}'`).join(', ')});

    UPDATE tags
    SET kind = 'user'
    WHERE id IN (
      SELECT DISTINCT t.id
      FROM tags t
      INNER JOIN block_tags bt ON bt.tag_id = t.id
      WHERE bt.source = 'manual'
    );
  `)
}

export function ensureTags(db: Database.Database, tagNames: string[], kind: TagKind = 'detail'): TagSuggestion[] {
  const normalizedNames = Array.from(
    new Set(
      tagNames
        .map(normalizeTagName)
        .filter((name) => name.length > 0)
        .slice(0, 5),
    ),
  )

  const transaction = db.transaction((names: string[]) => {
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO tags (id, name, normalized_name, is_default, kind, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    const now = new Date().toISOString()

    for (const name of names) {
      insert.run(uuid(), name, normalizeTagName(name), DEFAULT_TAG_NAMES.has(name) ? 1 : 0, kind, now)
    }
  })

  transaction(normalizedNames)

  return selectTagsByNames(db, normalizedNames)
}

export function listAvailableTags(db: Database.Database, query = '', limit = 20): TagSuggestion[] {
  const normalizedQuery = normalizeTagName(query)

  if (!normalizedQuery) {
    const rows = db
      .prepare(
        `
          SELECT id, name, is_default, kind
          FROM tags
          ORDER BY
            CASE kind
              WHEN 'category' THEN 0
              WHEN 'detail' THEN 1
              ELSE 2
            END,
            is_default DESC,
            name COLLATE NOCASE ASC
          LIMIT ?
        `,
      )
      .all(limit) as Array<{ id: string; name: string; is_default: number; kind: TagKind }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: Boolean(row.is_default),
      kind: row.kind,
    }))
  }

  const rows = db
    .prepare(
      `
        SELECT id, name, is_default, kind
        FROM tags
        WHERE normalized_name LIKE ?
        ORDER BY
          CASE
            WHEN normalized_name = lower(?) THEN 0
            WHEN normalized_name LIKE lower(?) THEN 1
            ELSE 2
          END,
          CASE kind
            WHEN 'category' THEN 0
            WHEN 'detail' THEN 1
            ELSE 2
          END,
          is_default DESC,
          name COLLATE NOCASE ASC
        LIMIT ?
      `,
    )
    .all(`%${normalizedQuery}%`, normalizedQuery, `${normalizedQuery}%`, limit) as Array<{
      id: string
      name: string
      is_default: number
      kind: TagKind
    }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.is_default),
    kind: row.kind,
  }))
}

export function getAllTagNames(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

export function getTagMemory(db: Database.Database): { categories: string[]; details: string[]; users: string[] } {
  const rows = db
    .prepare(
      `
        SELECT name, kind
        FROM tags
        ORDER BY name COLLATE NOCASE ASC
      `,
    )
    .all() as Array<{ name: string; kind: TagKind }>

  return {
    categories: rows.filter((row) => row.kind === 'category').map((row) => row.name),
    details: rows.filter((row) => row.kind === 'detail').map((row) => row.name),
    users: rows.filter((row) => row.kind === 'user').map((row) => row.name),
  }
}

export function getOrCreateTag(db: Database.Database, tagName: string, kind: TagKind = 'detail'): TagSuggestion {
  const normalizedName = normalizeTagName(tagName)

  if (!normalizedName) {
    throw new Error('标签名称不能为空。')
  }

  ensureTags(db, [normalizedName], kind)
  const [tag] = selectTagsByNames(db, [normalizedName])

  if (!tag) {
    throw new Error('标签创建失败。')
  }

  return {
    ...tag,
    isDefault: DEFAULT_TAG_NAMES.has(tag.name),
    kind,
  }
}
