import Database from 'better-sqlite3'

export interface VectorSchemaStatus {
  currentDimension: number | null
  ready: boolean
  changed: boolean
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
