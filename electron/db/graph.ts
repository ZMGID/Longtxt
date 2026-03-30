import Database from 'better-sqlite3'

import type { GraphEdge, GraphNode, TagKind } from '../../shared/types'

const TAG_COLOR_MAP: Record<string, string> = {
  技术: '#0f766e',
  学习: '#2563eb',
  工作: '#b45309',
  生活: '#16a34a',
  创意: '#7c3aed',
  内容: '#be185d',
  元标签: '#475569',
  default: '#525252',
}

const TAG_KIND_WEIGHT: Record<TagKind, number> = {
  category: 0.35,
  detail: 1,
  user: 1,
}

interface BlockTagRow {
  block_id: string
  content: string
  summary: string | null
  tag_name: string | null
  tag_kind: TagKind | null
}

function summarize(content: string, maxLength = 22): string {
  const flattened = content.replace(/\s+/g, ' ').trim()
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}…` : flattened
}

function getNodeColor(tags: string[]): string {
  const primaryTag = tags[0] ?? 'default'
  return TAG_COLOR_MAP[primaryTag] ?? TAG_COLOR_MAP.default
}

export function getGraphData(db: Database.Database, tagNames: string[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const normalizedTags = tagNames.map((tag) => tag.trim()).filter(Boolean)
  const rows = normalizedTags.length > 0
    ? (db
        .prepare(
          `
            SELECT DISTINCT b.id AS block_id, b.content, b.summary, t.name AS tag_name, t.kind AS tag_kind
            FROM blocks b
            LEFT JOIN block_tags bt ON bt.block_id = b.id
            LEFT JOIN tags t ON t.id = bt.tag_id
            WHERE b.id IN (
              SELECT bt2.block_id
              FROM block_tags bt2
              INNER JOIN tags t2 ON t2.id = bt2.tag_id
              WHERE t2.name IN (${normalizedTags.map(() => '?').join(', ')})
            )
            ORDER BY b.updated_at DESC
            LIMIT 400
          `,
        )
        .all(...normalizedTags) as BlockTagRow[])
    : (db
        .prepare(
          `
            SELECT b.id AS block_id, b.content, b.summary, t.name AS tag_name, t.kind AS tag_kind
            FROM blocks b
            LEFT JOIN block_tags bt ON bt.block_id = b.id
            LEFT JOIN tags t ON t.id = bt.tag_id
            ORDER BY b.updated_at DESC
            LIMIT 400
          `,
        )
        .all() as BlockTagRow[])

  const nodeMap = new Map<string, { content: string; summary: string | null; tags: Map<string, TagKind> }>()

  for (const row of rows) {
    const current = nodeMap.get(row.block_id) ?? {
      content: row.content,
      summary: row.summary,
      tags: new Map<string, TagKind>(),
    }

    if (row.tag_name) {
      current.tags.set(row.tag_name, row.tag_kind ?? 'detail')
    }

    nodeMap.set(row.block_id, current)
  }

  const ids = Array.from(nodeMap.keys())
  const edgeMap = new Map<string, GraphEdge>()
  const degreeMap = new Map<string, number>()

  for (let index = 0; index < ids.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < ids.length; nextIndex += 1) {
      const sourceId = ids[index]
      const targetId = ids[nextIndex]
      const sourceTags = nodeMap.get(sourceId)?.tags ?? new Map<string, TagKind>()
      const targetTags = nodeMap.get(targetId)?.tags ?? new Map<string, TagKind>()
      const sharedTags = Array.from(sourceTags.keys()).filter((tag) => targetTags.has(tag))

      if (sharedTags.length === 0) {
        continue
      }

      const weight = sharedTags.reduce((sum, tag) => {
        const kind = sourceTags.get(tag) ?? targetTags.get(tag) ?? 'detail'
        return sum + (TAG_KIND_WEIGHT[kind] ?? 0.35)
      }, 0)

      const key = `${sourceId}::${targetId}`
      edgeMap.set(key, {
        source: sourceId,
        target: targetId,
        weight,
        sharedTags,
      })

      degreeMap.set(sourceId, (degreeMap.get(sourceId) ?? 0) + weight)
      degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + weight)
    }
  }

  const nodes: GraphNode[] = ids.map((id) => {
    const block = nodeMap.get(id)!
    const tags = Array.from(block.tags.keys())
    const degree = degreeMap.get(id) ?? 0

    return {
      id,
      label: summarize(block.summary?.trim() ? block.summary : block.content),
      summary: block.summary,
      tags,
      color: getNodeColor(tags),
      size: Math.min(26, 10 + degree * 2),
    }
  })

  return {
    nodes,
    edges: Array.from(edgeMap.values()),
  }
}
