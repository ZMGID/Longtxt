import Database from 'better-sqlite3'

import { DEFAULT_AI_CONFIG } from '../../shared/config'
import type { AIConfig } from '../../shared/types'

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  ).run(key, value)
}

export function getAIConfig(db: Database.Database): AIConfig {
  const saved = getSetting(db, 'ai_config')

  if (!saved) {
    return DEFAULT_AI_CONFIG
  }

  try {
    const parsed = JSON.parse(saved) as AIConfig
    return {
      llm: {
        ...DEFAULT_AI_CONFIG.llm,
        ...parsed.llm,
      },
      embedding: {
        ...DEFAULT_AI_CONFIG.embedding,
        ...parsed.embedding,
      },
    }
  } catch {
    return DEFAULT_AI_CONFIG
  }
}
