import Database from 'better-sqlite3'

import type { GraphEdge, GraphNode, TagKind, TagSource } from '../../shared/types'

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

const SUPPRESSED_META_TAGS = new Set(['TODO', '重要', '临时', '归档'])
const COMMON_DEFAULT_TAG_RATIO = 0.18
const MIN_COMMON_DEFAULT_BLOCKS = 5
const MIN_EDGE_WEIGHT = 0.7
const GRAPH_BLOCK_LIMIT = 240

interface BlockTagRow {
  block_id: string
  content: string
  summary: string | null
  tag_name: string | null
  tag_kind: TagKind | null
  tag_is_default: number | null
  tag_source: TagSource | null
}

interface GraphTagInfo {
  name: string
  kind: TagKind
  isDefault: boolean
  source: TagSource
}

interface GraphNodeState {
  content: string
  summary: string | null
  tags: Map<string, GraphTagInfo>
}

interface CandidateEdge extends GraphEdge {
  key: string
  sharedTagWeights: Map<string, number>
}

function mergeEdgeTagInfo(left: GraphTagInfo, right: GraphTagInfo): GraphTagInfo {
  return {
    name: left.name,
    kind: left.kind === 'user' || right.kind === 'user'
      ? 'user'
      : left.kind === 'detail' || right.kind === 'detail'
        ? 'detail'
        : 'category',
    isDefault: left.isDefault && right.isDefault,
    source: left.source === 'manual' || right.source === 'manual' ? 'manual' : 'auto',
  }
}

function summarize(content: string, maxLength = 20): string {
  const flattened = content.replace(/\s+/g, ' ').trim()
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}…` : flattened
}

function getNodeColor(tags: GraphTagInfo[]): string {
  const categoryTag = tags.find((tag) => tag.kind === 'category')
  const primaryTag = categoryTag?.name ?? tags.find((tag) => !tag.isDefault)?.name ?? tags[0]?.name ?? 'default'
  return TAG_COLOR_MAP[primaryTag] ?? TAG_COLOR_MAP.default
}

function compareTags(left: GraphTagInfo, right: GraphTagInfo, tagBlockCounts: Map<string, number>): number {
  if (left.isDefault !== right.isDefault) {
    return Number(left.isDefault) - Number(right.isDefault)
  }

  const kindRank = { user: 0, detail: 1, category: 2 }
  if (kindRank[left.kind] !== kindRank[right.kind]) {
    return kindRank[left.kind] - kindRank[right.kind]
  }

  const leftCount = tagBlockCounts.get(left.name) ?? 0
  const rightCount = tagBlockCounts.get(right.name) ?? 0
  if (leftCount !== rightCount) {
    return leftCount - rightCount
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

function getNeighborLimit(totalNodes: number): number {
  if (totalNodes <= 12) {
    return Number.POSITIVE_INFINITY
  }

  if (totalNodes <= 32) {
    return 8
  }

  if (totalNodes <= 72) {
    return 6
  }

  return 5
}

function shouldUseTagForEdge(tag: GraphTagInfo, tagBlockCount: number, totalNodes: number): boolean {
  if (SUPPRESSED_META_TAGS.has(tag.name)) {
    return false
  }

  if (tag.kind === 'category') {
    return false
  }

  if (tag.kind === 'user' || tag.source === 'manual' || !tag.isDefault) {
    return true
  }

  const noisyThreshold = Math.max(MIN_COMMON_DEFAULT_BLOCKS, Math.ceil(totalNodes * COMMON_DEFAULT_TAG_RATIO))
  return tagBlockCount < noisyThreshold
}

function getTagEdgeWeight(tag: GraphTagInfo, tagBlockCount: number, totalNodes: number): number {
  const specificity = Math.log((totalNodes + 1) / tagBlockCount) + 0.35
  const sourceBoost = tag.source === 'manual' ? 1.25 : 1
  const defaultPenalty = tag.isDefault ? 0.78 : 1.12

  return Number((specificity * sourceBoost * defaultPenalty).toFixed(3))
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  if (right.weight !== left.weight) {
    return right.weight - left.weight
  }

  if (right.sharedTags.length !== left.sharedTags.length) {
    return right.sharedTags.length - left.sharedTags.length
  }

  return `${left.source}-${left.target}`.localeCompare(`${right.source}-${right.target}`)
}

export function getGraphData(db: Database.Database, tagNames: string[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const normalizedTags = tagNames.map((tag) => tag.trim()).filter(Boolean)
  const rows = normalizedTags.length > 0
    ? (db
        .prepare(
          `
            WITH selected_blocks AS (
              SELECT b.id, b.content, b.summary, b.updated_at
              FROM blocks b
              WHERE b.id IN (
                SELECT bt2.block_id
                FROM block_tags bt2
                INNER JOIN tags t2 ON t2.id = bt2.tag_id
                WHERE t2.name IN (${normalizedTags.map(() => '?').join(', ')})
              )
              ORDER BY b.updated_at DESC
              LIMIT ${GRAPH_BLOCK_LIMIT}
            )
            SELECT
              sb.id AS block_id,
              sb.content,
              sb.summary,
              t.name AS tag_name,
              t.kind AS tag_kind,
              t.is_default AS tag_is_default,
              bt.source AS tag_source
            FROM selected_blocks sb
            LEFT JOIN block_tags bt ON bt.block_id = sb.id
            LEFT JOIN tags t ON t.id = bt.tag_id
            ORDER BY sb.updated_at DESC, t.name ASC
          `,
        )
        .all(...normalizedTags) as BlockTagRow[])
    : (db
        .prepare(
          `
            WITH selected_blocks AS (
              SELECT b.id, b.content, b.summary, b.updated_at
              FROM blocks b
              ORDER BY b.updated_at DESC
              LIMIT ${GRAPH_BLOCK_LIMIT}
            )
            SELECT
              sb.id AS block_id,
              sb.content,
              sb.summary,
              t.name AS tag_name,
              t.kind AS tag_kind,
              t.is_default AS tag_is_default,
              bt.source AS tag_source
            FROM selected_blocks sb
            LEFT JOIN block_tags bt ON bt.block_id = sb.id
            LEFT JOIN tags t ON t.id = bt.tag_id
            ORDER BY sb.updated_at DESC, t.name ASC
          `,
        )
        .all() as BlockTagRow[])

  const nodeMap = new Map<string, GraphNodeState>()

  for (const row of rows) {
    const current = nodeMap.get(row.block_id) ?? {
      content: row.content,
      summary: row.summary,
      tags: new Map<string, GraphTagInfo>(),
    }

    if (row.tag_name) {
      current.tags.set(row.tag_name, {
        name: row.tag_name,
        kind: row.tag_kind ?? 'detail',
        isDefault: Boolean(row.tag_is_default),
        source: row.tag_source ?? 'auto',
      })
    }

    nodeMap.set(row.block_id, current)
  }

  const ids = Array.from(nodeMap.keys())
  const totalNodes = ids.length
  const tagBlockCounts = new Map<string, number>()
  const tagToBlockEntries = new Map<string, Array<{ blockId: string; tagInfo: GraphTagInfo }>>()

  for (const [blockId, block] of nodeMap.entries()) {
    for (const [tagName, tagInfo] of block.tags.entries()) {
      tagBlockCounts.set(tagName, (tagBlockCounts.get(tagName) ?? 0) + 1)
      const tagBlockEntries = tagToBlockEntries.get(tagName)

      if (tagBlockEntries) {
        tagBlockEntries.push({ blockId, tagInfo })
      } else {
        tagToBlockEntries.set(tagName, [{ blockId, tagInfo }])
      }
    }
  }

  const idOrder = new Map(ids.map((id, index) => [id, index]))
  const candidateEdgeMap = new Map<string, CandidateEdge>()

  for (const [tagName, blockEntries] of tagToBlockEntries.entries()) {
    const tagBlockCount = tagBlockCounts.get(tagName) ?? 0

    if (tagBlockCount < 2) {
      continue
    }

    for (let index = 0; index < blockEntries.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < blockEntries.length; nextIndex += 1) {
        const leftEntry = blockEntries[index]!
        const rightEntry = blockEntries[nextIndex]!
        const pairTagInfo = mergeEdgeTagInfo(leftEntry.tagInfo, rightEntry.tagInfo)

        if (!shouldUseTagForEdge(pairTagInfo, tagBlockCount, totalNodes)) {
          continue
        }

        const tagWeight = getTagEdgeWeight(pairTagInfo, tagBlockCount, totalNodes)
        const leftId = leftEntry.blockId
        const rightId = rightEntry.blockId
        const leftOrder = idOrder.get(leftId) ?? 0
        const rightOrder = idOrder.get(rightId) ?? 0
        const sourceId = leftOrder <= rightOrder ? leftId : rightId
        const targetId = leftOrder <= rightOrder ? rightId : leftId
        const edgeKey = `${sourceId}::${targetId}`
        const current = candidateEdgeMap.get(edgeKey)

        if (!current) {
          candidateEdgeMap.set(edgeKey, {
            key: edgeKey,
            source: sourceId,
            target: targetId,
            weight: Number(tagWeight.toFixed(3)),
            sharedTags: [tagName],
            sharedTagWeights: new Map([[tagName, tagWeight]]),
          })
          continue
        }

        current.weight = Number((current.weight + tagWeight).toFixed(3))
        current.sharedTags.push(tagName)
        current.sharedTagWeights.set(tagName, tagWeight)
      }
    }
  }

  const candidateEdges = Array.from(candidateEdgeMap.values())
    .map((edge) => ({
      ...edge,
      sharedTags: edge.sharedTags.sort((left, right) => {
        const leftWeight = edge.sharedTagWeights.get(left) ?? 0
        const rightWeight = edge.sharedTagWeights.get(right) ?? 0
        return rightWeight - leftWeight
      }),
    }))
    .filter((edge) => edge.weight >= MIN_EDGE_WEIGHT)

  const edgeBuckets = new Map<string, CandidateEdge[]>()
  for (const edge of candidateEdges) {
    edgeBuckets.set(edge.source, [...(edgeBuckets.get(edge.source) ?? []), edge])
    edgeBuckets.set(edge.target, [...(edgeBuckets.get(edge.target) ?? []), edge])
  }

  const keptEdgeKeys = new Set<string>()
  const neighborLimit = getNeighborLimit(totalNodes)

  for (const edges of edgeBuckets.values()) {
    const rankedEdges = [...edges].sort(compareEdges)
    const limitedEdges = Number.isFinite(neighborLimit) ? rankedEdges.slice(0, neighborLimit) : rankedEdges

    for (const edge of limitedEdges) {
      keptEdgeKeys.add(edge.key)
    }
  }

  const edges = candidateEdges
    .filter((edge) => keptEdgeKeys.has(edge.key))
    .sort(compareEdges)
    .map(({ source, target, weight, sharedTags }) => ({ source, target, weight, sharedTags }))

  const degreeMap = new Map<string, number>()
  for (const edge of edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + edge.weight)
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + edge.weight)
  }

  const nodes: GraphNode[] = ids.map((id) => {
    const block = nodeMap.get(id)!
    const orderedTags = Array.from(block.tags.values()).sort((left, right) => compareTags(left, right, tagBlockCounts))
    const degree = degreeMap.get(id) ?? 0

    return {
      id,
      label: summarize(block.summary?.trim() ? block.summary : block.content),
      summary: block.summary,
      tags: orderedTags.map((tag) => tag.name),
      color: getNodeColor(orderedTags),
      size: Math.min(18, 6 + degree * 1.35),
    }
  })

  return {
    nodes,
    edges,
  }
}
