import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

import type { AIExecutionMode, AiInsightHistoryRecord, AiInsightMethodId } from '../../shared/types'

interface AiInsightHistoryRow {
  id: string
  method_id: AiInsightMethodId
  anchor_date: string
  range_start: string
  range_end: string
  title: string
  content: string
  block_ids: string
  mode: AIExecutionMode
  empty: number
  created_at: string
}

interface CreateAiInsightHistoryInput {
  methodId: AiInsightMethodId
  date: string
  rangeStart: string
  rangeEnd: string
  title: string
  content: string
  blockIds: string[]
  mode: AIExecutionMode
  empty: boolean
  createdAt?: string
}

function mapAiInsightHistoryRow(row: AiInsightHistoryRow): AiInsightHistoryRecord {
  return {
    id: row.id,
    methodId: row.method_id,
    date: row.anchor_date,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    title: row.title,
    content: row.content,
    blockIds: JSON.parse(row.block_ids) as string[],
    mode: row.mode,
    empty: Boolean(row.empty),
    createdAt: row.created_at,
  }
}

export function createAiInsightHistoryRecord(
  db: Database.Database,
  input: CreateAiInsightHistoryInput,
): AiInsightHistoryRecord {
  const row = {
    id: uuid(),
    method_id: input.methodId,
    anchor_date: input.date,
    range_start: input.rangeStart,
    range_end: input.rangeEnd,
    title: input.title,
    content: input.content,
    block_ids: JSON.stringify(input.blockIds),
    mode: input.mode,
    empty: Number(input.empty),
    created_at: input.createdAt ?? new Date().toISOString(),
  }

  db.prepare(
    `
      INSERT INTO ai_insight_history (
        id,
        method_id,
        anchor_date,
        range_start,
        range_end,
        title,
        content,
        block_ids,
        mode,
        empty,
        created_at
      )
      VALUES (
        @id,
        @method_id,
        @anchor_date,
        @range_start,
        @range_end,
        @title,
        @content,
        @block_ids,
        @mode,
        @empty,
        @created_at
      )
    `,
  ).run(row)

  return mapAiInsightHistoryRow(row)
}

export function listAiInsightHistoryRecords(
  db: Database.Database,
  methodId: AiInsightMethodId | null = null,
  limit = 30,
): AiInsightHistoryRecord[] {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)))
  const sql = methodId
    ? `
        SELECT
          id,
          method_id,
          anchor_date,
          range_start,
          range_end,
          title,
          content,
          block_ids,
          mode,
          empty,
          created_at
        FROM ai_insight_history
        WHERE method_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `
    : `
        SELECT
          id,
          method_id,
          anchor_date,
          range_start,
          range_end,
          title,
          content,
          block_ids,
          mode,
          empty,
          created_at
        FROM ai_insight_history
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `

  const rows = (methodId
    ? db.prepare(sql).all(methodId, safeLimit)
    : db.prepare(sql).all(safeLimit)) as AiInsightHistoryRow[]

  return rows.map(mapAiInsightHistoryRow)
}
