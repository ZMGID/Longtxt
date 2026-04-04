// @vitest-environment node

import Database from 'better-sqlite3'

import { afterEach, describe, expect, it } from 'vitest'

import { createBlockRecord, addManualTagToBlock, syncAutoBlockTags } from '../db/blocks'
import { getGraphData } from '../db/graph'
import { initializeDatabase } from '../db/index'
import { getOrCreateTag } from '../db/tags'

const databases: Database.Database[] = []

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  initializeDatabase(db)
  databases.push(db)
  return db
}

function insertReadyBlock(db: Database.Database, id: string, content: string): void {
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Number(id.split('-').pop() ?? '0'))).toISOString()
  createBlockRecord(db, {
    id,
    content,
    status: 'ready',
    aiMode: 'mock',
    createdAt,
    updatedAt: createdAt,
  })
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close()
  }
})

describe('graph data', () => {
  it('suppresses high-frequency default tags while preserving specific shared tags', () => {
    const db = makeDb()
    const projectTag = getOrCreateTag(db, '项目', 'detail')
    const alphaPairTag = getOrCreateTag(db, 'alpha-pair', 'user')
    const betaPairTag = getOrCreateTag(db, 'beta-pair', 'user')
    const gammaPairTag = getOrCreateTag(db, 'gamma-pair', 'user')

    for (let index = 0; index < 10; index += 1) {
      const blockId = `block-${index}`
      insertReadyBlock(db, blockId, `图谱测试块 ${index}`)
      syncAutoBlockTags(db, blockId, [projectTag])
    }

    addManualTagToBlock(db, 'block-0', alphaPairTag)
    addManualTagToBlock(db, 'block-1', alphaPairTag)
    addManualTagToBlock(db, 'block-2', betaPairTag)
    addManualTagToBlock(db, 'block-3', betaPairTag)
    addManualTagToBlock(db, 'block-4', gammaPairTag)
    addManualTagToBlock(db, 'block-5', gammaPairTag)

    const graph = getGraphData(db)

    expect(graph.nodes).toHaveLength(10)
    expect(graph.edges).toHaveLength(3)
    expect(graph.edges.every((edge) => !edge.sharedTags.includes('项目'))).toBe(true)
    expect(graph.edges.map((edge) => edge.sharedTags[0]).sort()).toEqual(['alpha-pair', 'beta-pair', 'gamma-pair'])
  })

  it('does not create edges from shared category tags alone', () => {
    const db = makeDb()
    const techCategory = getOrCreateTag(db, '技术', 'category')

    insertReadyBlock(db, 'category-0', '技术类块 0')
    insertReadyBlock(db, 'category-1', '技术类块 1')
    syncAutoBlockTags(db, 'category-0', [techCategory])
    syncAutoBlockTags(db, 'category-1', [techCategory])

    const graph = getGraphData(db, ['技术'])

    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(0)
  })

  it('keeps matching blocks as nodes even when noisy default tags produce no useful edges', () => {
    const db = makeDb()
    const projectTag = getOrCreateTag(db, '项目', 'detail')

    for (let index = 0; index < 6; index += 1) {
      const blockId = `dense-${index}`
      insertReadyBlock(db, blockId, `只有高频默认标签的块 ${index}`)
      syncAutoBlockTags(db, blockId, [projectTag])
    }

    const graph = getGraphData(db, ['项目'])

    expect(graph.nodes).toHaveLength(6)
    expect(graph.edges).toHaveLength(0)
  })

  it('counts blocks rather than tag rows when limiting graph data', () => {
    const db = makeDb()

    for (let index = 0; index < 104; index += 1) {
      const blockId = `limit-${index}`
      insertReadyBlock(db, blockId, `用于节点计数回归测试的块 ${index}`)

      const tags = Array.from({ length: 6 }, (_, tagIndex) => getOrCreateTag(db, `细标签-${index}-${tagIndex}`, 'detail'))
      syncAutoBlockTags(db, blockId, tags)
    }

    const graph = getGraphData(db)

    expect(graph.nodes).toHaveLength(104)
  })
})
