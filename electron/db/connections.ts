import Database from 'better-sqlite3'

import { searchVectorMatches } from './vectors'

/**
 * 查找与指定块语义最相关的其他块。
 * 从 blocks_vec 读取自身向量 → KNN 搜索 → 排除自身。
 */
export function findRelatedBlockIds(
  db: Database.Database,
  blockId: string,
  limit: number,
): Array<{ id: string; score: number }> {
  // 从 vec0 虚拟表用主键读取向量
  const vecRow = db
    .prepare(`SELECT vec_f32(embedding) AS raw FROM blocks_vec WHERE block_id = ?`)
    .get(blockId) as { raw: Buffer } | undefined

  if (!vecRow?.raw) {
    return []
  }

  const float32 = new Float32Array(vecRow.raw.buffer, vecRow.raw.byteOffset, vecRow.raw.byteLength / 4)
  const vector = Array.from(float32)

  // KNN 搜索 limit+1 条（包含自身），过滤自身后取 limit 条
  const matches = searchVectorMatches(db, vector, limit + 1)

  return matches
    .filter((match) => match.id !== blockId)
    .slice(0, limit)
    .map((match) => ({
      id: match.id,
      // cosine distance → similarity
      score: 1 - match.distance,
    }))
}
