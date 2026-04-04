import Database from 'better-sqlite3'

export interface VectorSchemaStatus {
  currentDimension: number | null
  ready: boolean
  changed: boolean
}

export interface PendingBlockVectorJob {
  blockId: string
  contentUpdatedAt: string
  queuedAt: string
}

function toVectorLiteral(vector: number[]): string {
  return JSON.stringify(vector.map((value) => Number(value.toFixed(6))))
}

export function getVectorSchemaDimension(db: Database.Database): number | null {
  const row = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'blocks_vec'
      `,
    )
    .get() as { sql: string } | undefined

  const sql = row?.sql ?? ''
  const match = sql.match(/FLOAT\[(\d+)\]/i)

  return match ? Number(match[1]) : null
}

export function ensureVectorSchema(db: Database.Database, dimension: number): VectorSchemaStatus {
  const currentDimension = getVectorSchemaDimension(db)

  if (currentDimension === dimension) {
    return {
      currentDimension,
      ready: true,
      changed: false,
    }
  }

  db.exec(`DROP TABLE IF EXISTS blocks_vec`)
  db.exec(`
    CREATE VIRTUAL TABLE blocks_vec USING vec0(
      block_id TEXT PRIMARY KEY,
      embedding FLOAT[${dimension}]
    );
  `)

  return {
    currentDimension: dimension,
    ready: true,
    changed: true,
  }
}

export function upsertBlockVector(db: Database.Database, blockId: string, vector: number[]): void {
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM blocks_vec WHERE block_id = ?`).run(blockId)
    db.prepare(
      `
        INSERT INTO blocks_vec (block_id, embedding)
        VALUES (?, vec_f32(?))
      `,
    ).run(blockId, toVectorLiteral(vector))
  })

  transaction()
}

export function deleteBlockVector(db: Database.Database, blockId: string): void {
  db.prepare(`DELETE FROM blocks_vec WHERE block_id = ?`).run(blockId)
}

export function enqueueBlockVector(db: Database.Database, blockId: string, contentUpdatedAt: string, queuedAt: string): void {
  db.prepare(
    `
      INSERT INTO pending_block_vectors (block_id, content_updated_at, queued_at)
      VALUES (?, ?, ?)
      ON CONFLICT(block_id) DO UPDATE SET
        content_updated_at = excluded.content_updated_at,
        queued_at = excluded.queued_at
    `,
  ).run(blockId, contentUpdatedAt, queuedAt)
}

export function listPendingBlockVectors(db: Database.Database, limit: number): PendingBlockVectorJob[] {
  if (limit <= 0) {
    return []
  }

  return db
    .prepare(
      `
        SELECT block_id AS blockId, content_updated_at AS contentUpdatedAt, queued_at AS queuedAt
        FROM pending_block_vectors
        ORDER BY queued_at ASC, block_id ASC
        LIMIT ?
      `,
    )
    .all(limit) as PendingBlockVectorJob[]
}

export function getPendingBlockVectorsByIds(db: Database.Database, blockIds: string[]): PendingBlockVectorJob[] {
  if (blockIds.length === 0) {
    return []
  }

  return db
    .prepare(
      `
        SELECT block_id AS blockId, content_updated_at AS contentUpdatedAt, queued_at AS queuedAt
        FROM pending_block_vectors
        WHERE block_id IN (${blockIds.map(() => '?').join(', ')})
      `,
    )
    .all(...blockIds) as PendingBlockVectorJob[]
}

export function removePendingBlockVectors(db: Database.Database, blockIds: string[]): void {
  if (blockIds.length === 0) {
    return
  }

  db.prepare(`DELETE FROM pending_block_vectors WHERE block_id IN (${blockIds.map(() => '?').join(', ')})`).run(...blockIds)
}

export function removePendingBlockVector(db: Database.Database, blockId: string): void {
  db.prepare(`DELETE FROM pending_block_vectors WHERE block_id = ?`).run(blockId)
}

export function countPendingBlockVectors(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM pending_block_vectors`).get() as { total: number }
  return row.total
}

export function resetPendingBlockVectors(db: Database.Database): void {
  db.exec(`DELETE FROM pending_block_vectors`)
  db.exec(`
    INSERT INTO pending_block_vectors (block_id, content_updated_at, queued_at)
    SELECT id, updated_at, updated_at
    FROM blocks
    ORDER BY created_at ASC
  `)
}

export function searchVectorMatches(
  db: Database.Database,
  vector: number[],
  limit: number,
): Array<{ id: string; distance: number }> {
  return db
    .prepare(
      `
        SELECT block_id AS id, distance
        FROM blocks_vec
        WHERE embedding MATCH vec_f32(?)
          AND k = ?
      `,
    )
    .all(toVectorLiteral(vector), limit) as Array<{ id: string; distance: number }>
}

export function countBlockVectors(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM blocks_vec`).get() as { total: number }
  return row.total
}

export interface FailedBlockVector {
  blockId: string
  content: string
  errorMessage: string | null
  failedAt: number
  retryCount: number
}

export function insertFailedBlockVector(
  db: Database.Database,
  blockId: string,
  content: string,
  errorMessage: string,
): void {
  const now = Date.now()
  db.prepare(
    `
      INSERT INTO failed_block_vectors (block_id, content, error_message, failed_at, retry_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(block_id) DO UPDATE SET
        content = excluded.content,
        error_message = excluded.error_message,
        failed_at = excluded.failed_at,
        retry_count = retry_count + 1
    `,
  ).run(blockId, content, errorMessage, now)
}

export function listFailedBlockVectors(db: Database.Database): FailedBlockVector[] {
  return db
    .prepare(
      `
        SELECT block_id AS blockId, content, error_message AS errorMessage,
               failed_at AS failedAt, retry_count AS retryCount
        FROM failed_block_vectors
        ORDER BY failed_at ASC
      `,
    )
    .all() as FailedBlockVector[]
}

export function countFailedBlockVectors(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM failed_block_vectors`).get() as { total: number }
  return row.total
}

export function removeFailedBlockVector(db: Database.Database, blockId: string): void {
  db.prepare(`DELETE FROM failed_block_vectors WHERE block_id = ?`).run(blockId)
}

export function clearFailedBlockVectors(db: Database.Database): void {
  db.exec(`DELETE FROM failed_block_vectors`)
}
