import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type {
  CalendarDayDetail,
  CalendarDaySummary,
  CalendarEntry,
  CalendarEntryInput,
  CalendarEntryPatch,
  CalendarEntrySource,
  CalendarSuggestion,
  CalendarSuggestionAcceptInput,
} from '../../shared/types'
import { getBlocksByIds, listBlocksByDate } from './blocks'

interface CalendarEntryRow {
  id: string
  title: string
  notes: string | null
  date: string
  start_time: string | null
  all_day: number
  status: CalendarEntry['status']
  source: CalendarEntrySource
  linked_block_id: string | null
  created_at: string
  updated_at: string
}

interface CalendarSuggestionRow {
  id: string
  title: string
  notes: string | null
  date: string
  start_time: string | null
  all_day: number
  source_block_id: string
  confidence: number | null
  evidence_text: string | null
  created_at: string
  updated_at: string
}

export interface CalendarSuggestionRecordInput {
  title: string
  notes?: string | null
  date: string
  startTime?: string | null
  allDay: boolean
  confidence?: number
  evidenceText?: string | null
}

function formatLocalDate(value: string): string {
  const date = new Date(value)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function mapCalendarEntry(row: CalendarEntryRow): CalendarEntry {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    date: row.date,
    startTime: row.start_time,
    allDay: Boolean(row.all_day),
    status: row.status,
    source: row.source,
    linkedBlockId: row.linked_block_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCalendarSuggestion(row: CalendarSuggestionRow): CalendarSuggestion {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    date: row.date,
    startTime: row.start_time,
    allDay: Boolean(row.all_day),
    sourceBlockId: row.source_block_id,
    confidence: row.confidence ?? 0,
    evidenceText: row.evidence_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function findEntryById(db: Database.Database, id: string): CalendarEntry {
  const row = db
    .prepare(
      `
        SELECT
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          status,
          source,
          linked_block_id,
          created_at,
          updated_at
        FROM calendar_entries
        WHERE id = ?
      `,
    )
    .get(id) as CalendarEntryRow | undefined

  if (!row) {
    throw new Error(`Calendar entry ${id} not found`)
  }

  return mapCalendarEntry(row)
}

function findSuggestionById(db: Database.Database, id: string): CalendarSuggestion {
  const row = db
    .prepare(
      `
        SELECT
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          source_block_id,
          confidence,
          evidence_text,
          created_at,
          updated_at
        FROM calendar_suggestions
        WHERE id = ?
      `,
    )
    .get(id) as CalendarSuggestionRow | undefined

  if (!row) {
    throw new Error(`Calendar suggestion ${id} not found`)
  }

  return mapCalendarSuggestion(row)
}

function normalizeComparisonKey(entry: { title: string; date: string; startTime?: string | null }): string {
  return `${entry.date}::${entry.startTime ?? ''}::${entry.title.trim().toLowerCase()}`
}

export function listCalendarYears(db: Database.Database, currentYear = new Date().getFullYear()): number[] {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT year
        FROM (
          SELECT CAST(strftime('%Y', created_at, 'localtime') AS INTEGER) AS year FROM blocks
          UNION
          SELECT CAST(substr(date, 1, 4) AS INTEGER) AS year FROM calendar_entries
          UNION
          SELECT CAST(substr(date, 1, 4) AS INTEGER) AS year FROM calendar_suggestions
        )
        WHERE year IS NOT NULL
        ORDER BY year DESC
      `,
    )
    .all() as Array<{ year: number | null }>

  const years = rows
    .map((row) => row.year)
    .filter((year): year is number => typeof year === 'number' && Number.isInteger(year))

  return Array.from(new Set([currentYear, ...years])).sort((left, right) => right - left)
}

export function getCalendarHeatmap(db: Database.Database, year: number): {
  year: number
  totalContributions: number
  maxBlockCount: number
  days: CalendarDaySummary[]
} {
  const blockRows = db.prepare(`SELECT created_at AS createdAt FROM blocks ORDER BY created_at ASC`).all() as Array<{ createdAt: string }>
  const entryRows = db.prepare(`SELECT date FROM calendar_entries`).all() as Array<{ date: string }>
  const suggestionRows = db.prepare(`SELECT date FROM calendar_suggestions`).all() as Array<{ date: string }>

  const blockCountByDate = new Map<string, number>()
  const entryDateSet = new Set<string>()
  const suggestionDateSet = new Set<string>()

  for (const row of blockRows) {
    const date = formatLocalDate(row.createdAt)
    if (date.startsWith(`${year}-`)) {
      blockCountByDate.set(date, (blockCountByDate.get(date) ?? 0) + 1)
    }
  }

  for (const row of entryRows) {
    if (row.date.startsWith(`${year}-`)) {
      entryDateSet.add(row.date)
    }
  }

  for (const row of suggestionRows) {
    if (row.date.startsWith(`${year}-`)) {
      suggestionDateSet.add(row.date)
    }
  }

  const days: CalendarDaySummary[] = []
  const cursor = new Date(`${year}-01-01T00:00:00`)
  const end = new Date(`${year + 1}-01-01T00:00:00`)
  const maxBlockCount = Math.max(0, ...blockCountByDate.values())

  while (cursor < end) {
    const date = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, '0'),
      String(cursor.getDate()).padStart(2, '0'),
    ].join('-')
    const blockCount = blockCountByDate.get(date) ?? 0
    days.push({
      date,
      blockCount,
      intensityLevel: resolveIntensityLevel(blockCount, maxBlockCount),
      hasEntries: entryDateSet.has(date),
      hasSuggestions: suggestionDateSet.has(date),
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    year,
    totalContributions: days.reduce((total, day) => total + day.blockCount, 0),
    maxBlockCount,
    days,
  }
}

function resolveIntensityLevel(blockCount: number, maxBlockCount: number): number {
  if (blockCount <= 0) {
    return 0
  }

  if (maxBlockCount <= 1) {
    return 4
  }

  if (maxBlockCount === 2) {
    return blockCount === 1 ? 2 : 4
  }

  const ratio = blockCount / maxBlockCount

  if (ratio >= 0.75) {
    return 4
  }

  if (ratio >= 0.45) {
    return 3
  }

  if (ratio >= 0.2) {
    return 2
  }

  return 1
}

export function getCalendarDayDetail(db: Database.Database, date: string): CalendarDayDetail {
  const blocks = listBlocksByDate(db, date)
  const entryRows = db
    .prepare(
      `
        SELECT
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          status,
          source,
          linked_block_id,
          created_at,
          updated_at
        FROM calendar_entries
        WHERE date = ?
        ORDER BY all_day DESC, start_time ASC, created_at ASC
      `,
    )
    .all(date) as CalendarEntryRow[]
  const suggestionRows = db
    .prepare(
      `
        SELECT
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          source_block_id,
          confidence,
          evidence_text,
          created_at,
          updated_at
        FROM calendar_suggestions
        WHERE date = ?
        ORDER BY all_day DESC, start_time ASC, created_at ASC
      `,
    )
    .all(date) as CalendarSuggestionRow[]

  return {
    date,
    blockCount: blocks.length,
    blocks,
    entries: entryRows.map(mapCalendarEntry),
    suggestions: suggestionRows.map(mapCalendarSuggestion),
  }
}

export function listUpcomingCalendarEntries(
  db: Database.Database,
  startDate: string,
  endDate: string,
): CalendarEntry[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          status,
          source,
          linked_block_id,
          created_at,
          updated_at
        FROM calendar_entries
        WHERE date >= ? AND date <= ?
        ORDER BY date ASC, all_day DESC, start_time ASC, created_at ASC
      `,
    )
    .all(startDate, endDate) as CalendarEntryRow[]

  return rows.map(mapCalendarEntry)
}

export function createCalendarEntry(
  db: Database.Database,
  input: CalendarEntryInput,
  now: string,
  source: CalendarEntrySource = 'manual',
): CalendarEntry {
  const id = uuid()
  db.prepare(
    `
      INSERT INTO calendar_entries (
        id,
        title,
        notes,
        date,
        start_time,
        all_day,
        status,
        source,
        linked_block_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.title,
    input.notes ?? null,
    input.date,
    input.startTime ?? null,
    input.allDay ? 1 : 0,
    source,
    input.linkedBlockId ?? null,
    now,
    now,
  )

  return findEntryById(db, id)
}

export function updateCalendarEntry(
  db: Database.Database,
  id: string,
  patch: CalendarEntryPatch,
  now: string,
): CalendarEntry {
  const current = findEntryById(db, id)
  db.prepare(
    `
      UPDATE calendar_entries
      SET
        title = ?,
        notes = ?,
        date = ?,
        start_time = ?,
        all_day = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(
    patch.title ?? current.title,
    patch.notes === undefined ? current.notes : patch.notes,
    patch.date ?? current.date,
    patch.startTime === undefined ? current.startTime : patch.startTime,
    patch.allDay === undefined ? Number(current.allDay) : Number(patch.allDay),
    patch.status ?? current.status,
    now,
    id,
  )

  return findEntryById(db, id)
}

export function removeCalendarEntry(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM calendar_entries WHERE id = ?`).run(id)
}

export function replaceCalendarSuggestionsForBlock(
  db: Database.Database,
  blockId: string,
  suggestions: CalendarSuggestionRecordInput[],
  now: string,
): void {
  const existingEntryRows = db
    .prepare(
      `
        SELECT title, date, start_time AS startTime
        FROM calendar_entries
        WHERE linked_block_id = ?
      `,
    )
    .all(blockId) as Array<{ title: string; date: string; startTime: string | null }>

  const existingKeys = new Set(existingEntryRows.map((row) => normalizeComparisonKey(row)))
  const deduped = suggestions.filter((suggestion, index, items) => {
    const key = normalizeComparisonKey(suggestion)

    if (existingKeys.has(key)) {
      return false
    }

    return items.findIndex((item) => normalizeComparisonKey(item) === key) === index
  })

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM calendar_suggestions WHERE source_block_id = ?`).run(blockId)

    if (deduped.length === 0) {
      return
    }

    const insert = db.prepare(
      `
        INSERT INTO calendar_suggestions (
          id,
          source_block_id,
          title,
          notes,
          date,
          start_time,
          all_day,
          confidence,
          evidence_text,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )

    for (const suggestion of deduped) {
      insert.run(
        uuid(),
        blockId,
        suggestion.title,
        suggestion.notes ?? null,
        suggestion.date,
        suggestion.startTime ?? null,
        suggestion.allDay ? 1 : 0,
        suggestion.confidence ?? 0,
        suggestion.evidenceText ?? null,
        now,
        now,
      )
    }
  })

  transaction()
}

export function autoAcceptCalendarSuggestionsForBlock(
  db: Database.Database,
  blockId: string,
  suggestions: CalendarSuggestionRecordInput[],
  now: string,
): CalendarEntry[] {
  const existingEntryRows = db
    .prepare(
      `
        SELECT title, date, start_time AS startTime
        FROM calendar_entries
        WHERE linked_block_id = ?
      `,
    )
    .all(blockId) as Array<{ title: string; date: string; startTime: string | null }>

  const existingKeys = new Set(existingEntryRows.map((row) => normalizeComparisonKey(row)))
  const deduped = suggestions.filter((suggestion, index, items) => {
    const key = normalizeComparisonKey(suggestion)

    if (existingKeys.has(key)) {
      return false
    }

    return items.findIndex((item) => normalizeComparisonKey(item) === key) === index
  })

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM calendar_suggestions WHERE source_block_id = ?`).run(blockId)

    if (deduped.length === 0) {
      return [] as CalendarEntry[]
    }

    const insert = db.prepare(
      `
        INSERT INTO calendar_entries (
          id,
          title,
          notes,
          date,
          start_time,
          all_day,
          status,
          source,
          linked_block_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)
      `,
    )
    const createdIds: string[] = []

    for (const suggestion of deduped) {
      const id = uuid()
      insert.run(
        id,
        suggestion.title,
        suggestion.notes ?? null,
        suggestion.date,
        suggestion.startTime ?? null,
        suggestion.allDay ? 1 : 0,
        'ai-accepted',
        blockId,
        now,
        now,
      )
      createdIds.push(id)
    }

    return createdIds.map((id) => findEntryById(db, id))
  })

  return transaction()
}

export function acceptCalendarSuggestion(
  db: Database.Database,
  suggestionId: string,
  overrides: CalendarSuggestionAcceptInput | undefined,
  now: string,
): CalendarEntry {
  const suggestion = findSuggestionById(db, suggestionId)
  const transaction = db.transaction(() => {
    const entry = createCalendarEntry(
      db,
      {
        title: overrides?.title ?? suggestion.title,
        date: overrides?.date ?? suggestion.date,
        notes: overrides?.notes === undefined ? suggestion.notes : overrides.notes,
        startTime: overrides?.startTime === undefined ? suggestion.startTime : overrides.startTime,
        allDay: overrides?.allDay ?? suggestion.allDay,
        linkedBlockId: overrides?.linkedBlockId ?? suggestion.sourceBlockId,
      },
      now,
      'ai-accepted',
    )
    db.prepare(`DELETE FROM calendar_suggestions WHERE id = ?`).run(suggestionId)
    return entry
  })

  return transaction()
}

export function dismissCalendarSuggestion(db: Database.Database, suggestionId: string): void {
  db.prepare(`DELETE FROM calendar_suggestions WHERE id = ?`).run(suggestionId)
}

export function clearCalendarSuggestionsForBlock(db: Database.Database, blockId: string): void {
  db.prepare(`DELETE FROM calendar_suggestions WHERE source_block_id = ?`).run(blockId)
}

export function removeCalendarSuggestionsForMissingBlocks(db: Database.Database): void {
  db.prepare(
    `
      DELETE FROM calendar_suggestions
      WHERE source_block_id NOT IN (SELECT id FROM blocks)
    `,
  ).run()
}

export function getCalendarSuggestionSourceBlockIds(db: Database.Database, date: string): string[] {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT source_block_id AS sourceBlockId
        FROM calendar_suggestions
        WHERE date = ?
        ORDER BY created_at ASC
      `,
    )
    .all(date) as Array<{ sourceBlockId: string }>

  return rows.map((row) => row.sourceBlockId)
}

export function getCalendarSuggestionBlocks(db: Database.Database, date: string) {
  return getBlocksByIds(db, getCalendarSuggestionSourceBlockIds(db, date))
}
