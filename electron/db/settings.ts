import Database from 'better-sqlite3'

import { parseAIConfig } from '../../shared/config'
import type { AIConfig } from '../../shared/types'

export { parseAIConfig } from '../../shared/config'

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
  return parseAIConfig(getSetting(db, 'ai_config'))
}
