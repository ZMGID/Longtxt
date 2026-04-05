// @vitest-environment node

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { afterEach, describe, expect, it } from 'vitest'

import { ensureVectorSchema, getVectorSchemaDimension, upsertBlockVector } from '../db/vectors'
import { resolvePackagedExtensionPath } from '../db'

const databases: Database.Database[] = []

function createDb() {
  const db = new Database(':memory:')
  db.loadExtension(resolvePackagedExtensionPath(sqliteVec.getLoadablePath()))
  databases.push(db)
  return db
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close()
  }
})

describe('vector schema', () => {
  it('creates schema with the requested dimension', () => {
    const db = createDb()
    const status = ensureVectorSchema(db, 1536)

    expect(status.ready).toBe(true)
    expect(status.changed).toBe(true)
    expect(getVectorSchemaDimension(db)).toBe(1536)
  })

  it('rebuilds schema when dimension changes and clears previous rows', () => {
    const db = createDb()
    ensureVectorSchema(db, 1536)
    upsertBlockVector(db, 'block-1', new Array(1536).fill(0.1))

    const changed = ensureVectorSchema(db, 1024)
    const row = db.prepare(`SELECT COUNT(*) AS total FROM blocks_vec`).get() as { total: number }

    expect(changed.changed).toBe(true)
    expect(getVectorSchemaDimension(db)).toBe(1024)
    expect(row.total).toBe(0)
  })
})

describe('resolvePackagedExtensionPath', () => {
  it('keeps the original path when no unpacked copy exists', () => {
    const originalPath = '/tmp/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'

    expect(resolvePackagedExtensionPath(originalPath, () => false)).toBe(originalPath)
  })

  it('prefers app.asar.unpacked when the unpacked copy exists', () => {
    const originalPath = '/tmp/My App.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'

    expect(
      resolvePackagedExtensionPath(originalPath, (candidatePath) => candidatePath.includes('app.asar.unpacked')),
    ).toBe('/tmp/My App.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib')
  })
})
