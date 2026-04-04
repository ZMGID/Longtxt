// @vitest-environment node

import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { AIConfig } from '../../shared/types'
import { createAppContext } from '../appContext'

const dataDirectory = join(homedir(), 'Library', 'Application Support', 'Electron', 'data')
const dbPath = join(dataDirectory, 'changbu.sqlite3')
const targetCount = 100
const batchSize = 10

function openDb(): Database.Database {
  return new Database(dbPath)
}

function readAiConfig(): AIConfig {
  const db = openDb()

  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_config'").get() as { value: string } | undefined

    if (!row?.value) {
      throw new Error('未找到 ai_config。')
    }

    return JSON.parse(row.value) as AIConfig
  } finally {
    db.close()
  }
}

function listManualBlocks(): Array<{ id: string; content: string; index: number }> {
  const db = openDb()

  try {
    const rows = db
      .prepare("SELECT id, content FROM blocks WHERE content LIKE '手动测试块 %' ORDER BY created_at ASC")
      .all() as Array<{ id: string; content: string }>

    return rows
      .map((row) => {
        const match = row.content.match(/^手动测试块\s+(\d+)/)
        return match ? { ...row, index: Number(match[1]) } : null
      })
      .filter((row): row is { id: string; content: string; index: number } => Boolean(row))
  } finally {
    db.close()
  }
}

function buildManualBlockContent(index: number): string {
  const topics = [
    ['产品研究', '访谈纪要', '路线图'],
    ['工程实现', 'Electron', 'SQLite'],
    ['写作整理', '知识卡片', '结构化输出'],
    ['生活记录', '旅行计划', '预算复盘'],
    ['健康训练', '跑步恢复', '饮食记录'],
    ['前端体验', 'React', '交互细节'],
    ['AI 工作流', '检索增强', '提示词实验'],
    ['项目管理', '里程碑', '风险跟踪'],
    ['阅读笔记', '观点摘录', '长期记忆'],
    ['自由职业', '报价合同', '回款安排'],
  ]
  const [topic, keywordA, keywordB] = topics[(index - 1) % topics.length]

  return [
    `手动测试块 ${index}`,
    '',
    `主题：${topic}`,
    `关键词：${keywordA}、${keywordB}`,
    `这是一条用于真实 live AI 测试的填充内容，编号为 ${index}。`,
    '我想观察时间轴滚动、检索命中、标签补全、摘要生成和向量补齐的整体表现。',
    '补充描述：这条记录包含自然语言句子，方便测试全文搜索、主题检索以及相似内容召回。',
    `场景备注：如果你搜索 ${keywordA} 或 ${keywordB}，应该更容易看到这条记录出现在结果里。`,
  ].join('\n')
}

describe('manual live reenrich', () => {
  it(
    'reprocesses 100 manual blocks through the live pipeline',
    async () => {
      const context = createAppContext({
        dataDirectory,
        openPath: async () => '',
      })

      try {
        let meta = await context.getMeta()
        if (meta.activeAiMode !== 'live') {
          const config = readAiConfig()
          const probe = await context.testApi(config)
          expect(probe.success).toBe(true)
          meta = await context.getMeta()
        }

        expect(meta.activeAiMode).toBe('live')

        let manualBlocks = listManualBlocks()
        const existingIndexes = new Set(manualBlocks.map((block) => block.index))
        for (let index = 1; index <= targetCount; index += 1) {
          if (!existingIndexes.has(index)) {
            await context.createBlock(buildManualBlockContent(index))
          }
        }

        await context.whenIdle()
        manualBlocks = listManualBlocks().filter((block) => block.index >= 1 && block.index <= targetCount)
        expect(manualBlocks).toHaveLength(targetCount)

        for (let start = 0; start < manualBlocks.length; start += batchSize) {
          const batch = manualBlocks.slice(start, start + batchSize)
          await Promise.all(batch.map((block) => context.updateBlock(block.id, block.content)))
          await context.whenIdle()
        }

        const db = openDb()
        try {
          const statusRows = db
            .prepare(
              "SELECT status, ai_mode AS aiMode, COUNT(*) AS total FROM blocks WHERE content LIKE '手动测试块 %' GROUP BY status, ai_mode ORDER BY status, ai_mode",
            )
            .all() as Array<{ status: string; aiMode: string; total: number }>

          const total = db.prepare("SELECT COUNT(*) AS total FROM blocks WHERE content LIKE '手动测试块 %'").get() as { total: number }
          const nonLive = db.prepare("SELECT COUNT(*) AS total FROM blocks WHERE content LIKE '手动测试块 %' AND ai_mode != 'live'").get() as { total: number }
          const nonReady = db.prepare("SELECT COUNT(*) AS total FROM blocks WHERE content LIKE '手动测试块 %' AND status != 'ready'").get() as { total: number }

          console.log(JSON.stringify({ total: total.total, nonLive: nonLive.total, nonReady: nonReady.total, statusRows }, null, 2))

          expect(total.total).toBe(targetCount)
          expect(nonLive.total).toBe(0)
          expect(nonReady.total).toBe(0)
        } finally {
          db.close()
        }
      } finally {
        context.dispose()
      }
    },
    60 * 60 * 1000,
  )
})
