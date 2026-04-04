// @vitest-environment node

import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import type { AIConfig, DocGenerationChunk, SearchResult } from '../../shared/types'
import { createAppContext } from '../appContext'
import * as sqliteVec from 'sqlite-vec'

const USER_DB_PATH = join(homedir(), 'Library', 'Application Support', 'Electron', 'data', 'changbu.sqlite3')
const REPORT_PATH = join(tmpdir(), 'changbu-live-stress-report.json')
const TOTAL_BLOCKS = 300
const BATCH_SIZE = 25
const SEARCH_LIMIT = 12

type Theme = {
  key: string
  title: string
  phrases: string[]
  problems: string[]
  actions: string[]
  evidence: string[]
}

const THEMES: Theme[] = [
  {
    key: 'migration',
    title: '知识库迁移',
    phrases: ['把 Notion 工作流迁到 Obsidian', '保留 AI 写作体验的同时转向本地优先笔记', '比较本地知识库和云端协作的取舍'],
    problems: ['舍不得 Notion AI 的总结能力', '担心数据库模板和关系视图丢失', '插件太多导致配置越来越重'],
    actions: ['梳理迁移清单并分阶段搬运内容', '比较 Obsidian 插件、外部模型和自动化脚本', '先迁移高频笔记，再迁移归档内容'],
    evidence: ['双链、标签、模板、看板视图', '本地同步、iCloud、Git 版本管理', '知识卡片、日报、周报、项目复盘'],
  },
  {
    key: 'changbu-arch',
    title: '长布架构',
    phrases: ['Electron + React + SQLite 的本地优先桌面架构', '块记录、自动标签、向量补全和混合检索主链路', '主进程负责任务队列和文档流式生成'],
    problems: ['渲染层状态越来越重', '主进程任务并发可能挤压 IO', 'IPC 暴露面容易和共享类型脱节'],
    actions: ['梳理进程边界和 IPC 契约', '检查 sqlite-vec 与 FTS5 的降级路径', '验证搜索结果和文档生成是否走同一套召回逻辑'],
    evidence: ['本地数据库、预加载桥接、BrowserWindow 事件', '混合检索、reciprocal rank、streaming 文档', '块状态 pending/ready/error'],
  },
  {
    key: 'retrieval',
    title: '检索与 Agent',
    phrases: ['向量召回、全文检索和标签排序一起工作', 'Agent 记忆、工具调用和知识检索需要协同', 'Embedding、RAG 和 rerank 的边界要明确'],
    problems: ['只看关键词会漏掉语义接近的内容', '召回太多会让下游生成噪声变大', '记忆和即时检索经常混在一起'],
    actions: ['拆开召回、筛选和生成三个阶段', '对比纯 FTS、纯向量和混合排序表现', '记录查询改写和引用块筛选规则'],
    evidence: ['embedding 维度、top-k、参考块上限', '工具调用日志、上下文窗口、引用解释', '多轮对话、长期记忆、任务分解'],
  },
  {
    key: 'react-perf',
    title: '前端性能',
    phrases: ['React 大列表滚动性能和状态同步', '虚拟列表、memo 和渲染分层', '表单交互、键盘事件和编辑器联动'],
    problems: ['列表更新后重渲染过多', '输入框卡顿影响编辑手感', '组件职责混杂导致优化很难定位'],
    actions: ['给高频组件做渲染剖析', '检查依赖数组和派生状态', '把滚动、编辑、筛选拆开测量'],
    evidence: ['react-virtuoso、CodeMirror、useMemo', '长列表、筛选条件、搜索高亮', '渲染次数、帧率、输入延迟'],
  },
  {
    key: 'travel',
    title: '旅行规划',
    phrases: ['东京自由行路线和预算安排', '关西行程里的交通、住宿和餐厅选择', '旅行前把证件、网络和付款方式准备好'],
    problems: ['换乘复杂导致行程容易失控', '热门餐厅预约窗口很短', '预算在住宿和交通上超支'],
    actions: ['按区域拆分每日路线', '给餐厅和景点建立备选清单', '把交通卡、签证和保险提前确认'],
    evidence: ['羽田机场、上野、浅草、镰仓', '新干线、地铁通票、酒店退改规则', '预算表、行李清单、天气预案'],
  },
  {
    key: 'fitness',
    title: '健康训练',
    phrases: ['跑步计划需要兼顾睡眠和恢复', '力量训练和饮食记录一起看更有用', '久坐之后要重新建立运动节奏'],
    problems: ['睡眠不足时心率飘高', '连续训练后膝盖和小腿发紧', '饮食记录断掉就很难复盘'],
    actions: ['把训练强度和睡眠质量放在同一张表里', '做每周恢复日和轻松跑安排', '把饮食、体重和主观疲劳一起记录'],
    evidence: ['晨跑、步频、配速、区间心率', '深睡时长、恢复感、压力水平', '蛋白质、碳水、咖啡因摄入'],
  },
  {
    key: 'product',
    title: '产品研究',
    phrases: ['把用户访谈整理成 PRD 和路线图', '需求优先级和价值假设要拆清楚', '原型验证和正式开发之间需要留缓冲'],
    problems: ['访谈纪要很多但结论松散', '需求池越滚越大很难排序', '不同角色对成功指标理解不一致'],
    actions: ['先归纳问题场景，再写目标用户和约束', '把需求拆成最小可验证版本', '给每个里程碑配验收指标和回滚条件'],
    evidence: ['PRD、竞品分析、用户画像', '访谈摘要、需求排序、里程碑', '留存、转化、效率、满意度'],
  },
  {
    key: 'reading',
    title: '阅读笔记',
    phrases: ['把阅读摘录整理成长期知识卡片', '书摘、批注和行动项需要分层保存', '阅读系统要支持回顾和主题串联'],
    problems: ['摘录很多但复用率不高', '回顾时找不到当时的上下文', '主题串联只靠标签很容易碎片化'],
    actions: ['把书摘压缩成一句观点和一个例子', '建立按主题回顾的节奏', '把高频主题沉淀为 evergreen note'],
    evidence: ['书摘、批注、例子、反例', '主题卡片、观点网络、复盘', '知识整理、输出选题、长期记忆'],
  },
  {
    key: 'freelance',
    title: '自由职业',
    phrases: ['自由职业的现金流、开票和合同管理', '项目报价和交付节奏需要标准化', '独立开发收入不稳定时要先看回款'],
    problems: ['回款周期拉长影响现金流', '开票和报销材料分散', '报价没有沉淀成可复用模板'],
    actions: ['把合同、里程碑和回款节点绑在一起', '建立月度现金流看板', '整理标准报价、范围边界和变更流程'],
    evidence: ['报价单、合同模板、发票记录', '回款日期、预付款、尾款', '项目范围、沟通纪要、验收标准'],
  },
  {
    key: 'coffee',
    title: '咖啡实验',
    phrases: ['手冲咖啡的水温、研磨和萃取参数记录', '不同豆子需要不同的闷蒸和注水节奏', '家庭咖啡角想做稳定复现的冲煮流程'],
    problems: ['同一支豆子第二周风味变化很大', '研磨度一变就容易过萃或欠萃', '记录不完整导致很难复现好喝的一杯'],
    actions: ['固定滤杯和注水动作后再调参', '把风味、时间和粉水比一起记录', '比较浅烘与中烘的萃取窗口'],
    evidence: ['粉水比、总时长、闷蒸秒数', '花香、柑橘、坚果、甜感', 'V60、磨豆机、滤纸、手冲壶'],
  },
]

const SEARCH_QUERIES = [
  '本地优先知识库但保留智能写作体验',
  '桌面笔记应用里的混合检索和向量召回',
  'Agent 记忆和 RAG 检索怎么配合',
  'React 大列表滚动卡顿怎么排查',
  '东京自由行预算和交通路线',
  '睡眠恢复和跑步安排怎么一起看',
  '把用户访谈整理成产品文档',
  '阅读摘录怎样沉淀成长期知识卡片',
  '自由职业的合同开票和现金流',
  '手冲咖啡参数怎么做稳定复现',
]

const DOCUMENT_TOPICS = [
  '从 Notion 迁移到 Obsidian 时如何保留 AI 工作流',
  'Electron 本地优先笔记应用的搜索与文档生成架构',
  'React 大列表性能优化排查方案',
]

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length]
}

function buildDataset(total: number): string[] {
  return Array.from({ length: total }, (_, index) => {
    const theme = THEMES[index % THEMES.length]
    const localIndex = Math.floor(index / THEMES.length)
    const phrase = pick(theme.phrases, localIndex)
    const problem = pick(theme.problems, localIndex * 2 + 1)
    const action = pick(theme.actions, localIndex * 3 + 2)
    const evidence = pick(theme.evidence, localIndex * 5 + 3)

    return [
      `第 ${index + 1} 条记录，主题是${theme.title}。`,
      `这条笔记围绕${phrase}展开。`,
      `当前遇到的核心问题是：${problem}。`,
      `下一步准备：${action}。`,
      `补充线索包含：${evidence}。`,
      `我希望后续能把这些碎片信息整理成可检索、可生成文档的稳定资料。`,
    ].join('')
  })
}

function readUserAiConfig(): AIConfig {
  const db = new Database(USER_DB_PATH, { readonly: true })

  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_config'").get() as { value: string } | undefined

    if (!row?.value) {
      throw new Error('未在用户数据库中找到 ai_config。')
    }

    return JSON.parse(row.value) as AIConfig
  } finally {
    db.close()
  }
}

function openTempDatabase(databasePath: string): Database.Database {
  const db = new Database(databasePath)
  db.loadExtension(sqliteVec.getLoadablePath())
  return db
}

function readDatabaseStats(databasePath: string) {
  const db = openTempDatabase(databasePath)

  try {
    const statusRows = db.prepare('SELECT status, COUNT(*) AS total FROM blocks GROUP BY status ORDER BY total DESC').all() as Array<{ status: string; total: number }>
    const tagRows = db.prepare('SELECT source, COUNT(*) AS total FROM block_tags GROUP BY source ORDER BY total DESC').all() as Array<{ source: string; total: number }>
    const blockCount = db.prepare('SELECT COUNT(*) AS total FROM blocks').get() as { total: number }
    const vectorCount = db.prepare('SELECT COUNT(*) AS total FROM blocks_vec').get() as { total: number }
    const errorRows = db.prepare("SELECT id, error_message AS errorMessage FROM blocks WHERE status = 'error' ORDER BY updated_at DESC LIMIT 20").all() as Array<{ id: string; errorMessage: string | null }>

    return {
      blockCount: blockCount.total,
      vectorCount: vectorCount.total,
      statusRows,
      tagRows,
      errorRows,
    }
  } finally {
    db.close()
  }
}

function summarizeSearchResults(results: SearchResult[]) {
  const vectorHits = results.filter((item) => item.matchSource.includes('vector')).length
  const ftsHits = results.filter((item) => item.matchSource.includes('fts')).length
  const tagHits = results.filter((item) => item.matchSource.includes('tag')).length
  const pureVectorHits = results.filter((item) => item.matchSource.length === 1 && item.matchSource[0] === 'vector').length

  return {
    total: results.length,
    vectorHits,
    pureVectorHits,
    ftsHits,
    tagHits,
    topResults: results.slice(0, 5).map((item) => ({
      score: item.score,
      matchSource: item.matchSource,
      excerpt: item.block.content.slice(0, 90),
    })),
  }
}

describe('live stress test', () => {
  it(
    'creates hundreds of live blocks and records runtime diagnostics',
    async () => {
      const tempDirectory = mkdtempSync(join(tmpdir(), 'changbu-live-stress-'))
      const databasePath = join(tempDirectory, 'changbu.sqlite3')
      const report: Record<string, unknown> = {
        startedAt: new Date().toISOString(),
        reportPath: REPORT_PATH,
        tempDirectory,
        databasePath,
        configuration: {},
        batches: [],
        searches: [],
        documents: [],
        issues: [],
      }

      const docChunks: DocGenerationChunk[] = []
      const context = createAppContext({
        dataDirectory: tempDirectory,
        openPath: async () => '',
        onDocGenerationChunk: (chunk) => {
          docChunks.push(chunk)
        },
      })

      try {
        const config = readUserAiConfig()
        await context.setSetting('ai_config', JSON.stringify(config))
        const probe = await context.testApi(config)
        const metaAfterProbe = await context.getMeta()

        report.configuration = {
          llmModel: config.llm.model,
          embeddingModel: config.embedding.model,
          probeSuccess: probe.success,
          probeEmbeddingDimension: probe.embeddingDimension,
          activeAiMode: metaAfterProbe.activeAiMode,
          vectorReady: metaAfterProbe.vectorReady,
          vectorSchemaReady: metaAfterProbe.vectorSchemaReady,
        }

        expect(probe.success).toBe(true)
        expect(metaAfterProbe.activeAiMode).toBe('live')

        const dataset = buildDataset(TOTAL_BLOCKS)
        const batches = chunk(dataset, BATCH_SIZE)
        let createdCount = 0

        for (const [batchIndex, batch] of batches.entries()) {
          const enqueueStart = Date.now()
          await Promise.all(batch.map((content) => context.createBlock(content)))
          const enqueueMs = Date.now() - enqueueStart

          const settleStart = Date.now()
          await context.whenIdle()
          const settleMs = Date.now() - settleStart

          createdCount += batch.length

          const stats = readDatabaseStats(databasePath)
          const meta = await context.getMeta()
          const memory = process.memoryUsage()

          ;(report.batches as Array<Record<string, unknown>>).push({
            batchIndex: batchIndex + 1,
            batchSize: batch.length,
            createdCount,
            enqueueMs,
            settleMs,
            blockCount: stats.blockCount,
            vectorCount: stats.vectorCount,
            statuses: stats.statusRows,
            recentErrors: stats.errorRows,
            activeAiMode: meta.activeAiMode,
            vectorSchemaReady: meta.vectorSchemaReady,
            lastAiError: meta.lastAiError,
            tokenUsage: meta.tokenUsage,
            rssMB: round(memory.rss / 1024 / 1024),
            heapUsedMB: round(memory.heapUsed / 1024 / 1024),
          })

          if (stats.errorRows.length > 0) {
            ;(report.issues as Array<Record<string, unknown>>).push({
              stage: 'batch',
              batchIndex: batchIndex + 1,
              type: 'block-errors',
              errors: stats.errorRows,
            })
          }

          if (!meta.vectorSchemaReady) {
            ;(report.issues as Array<Record<string, unknown>>).push({
              stage: 'batch',
              batchIndex: batchIndex + 1,
              type: 'vector-schema-not-ready',
              lastAiError: meta.lastAiError,
            })
          }
        }

        for (const query of SEARCH_QUERIES) {
          const searchStart = Date.now()
          const results = await context.searchBlocks(query, SEARCH_LIMIT)
          const durationMs = Date.now() - searchStart

          ;(report.searches as Array<Record<string, unknown>>).push({
            query,
            durationMs,
            ...summarizeSearchResults(results),
          })
        }

        for (const topic of DOCUMENT_TOPICS) {
          const startedAt = Date.now()
          const request = await context.generateDocument(topic)
          await context.whenIdle()
          const durationMs = Date.now() - startedAt
          const relatedChunks = docChunks.filter((chunk) => chunk.requestId === request.requestId)
          const finalChunk = relatedChunks.find((chunk) => chunk.done)

          ;(report.documents as Array<Record<string, unknown>>).push({
            topic,
            durationMs,
            mode: request.mode,
            selectedBlockCount: request.blockIds.length,
            chunkCount: relatedChunks.length,
            finalLength: finalChunk?.fullText?.length ?? 0,
            error: finalChunk?.error ?? null,
          })

          if (finalChunk?.error) {
            ;(report.issues as Array<Record<string, unknown>>).push({
              stage: 'document',
              topic,
              type: 'document-error',
              error: finalChunk.error,
            })
          }
        }

        const finalStats = readDatabaseStats(databasePath)
        const finalMeta = await context.getMeta()
        const databaseSize = openTempDatabase(databasePath)

        try {
          report.summary = {
            totalBlocks: finalStats.blockCount,
            totalVectors: finalStats.vectorCount,
            statusBreakdown: finalStats.statusRows,
            tagBreakdown: finalStats.tagRows,
            activeAiMode: finalMeta.activeAiMode,
            vectorReady: finalMeta.vectorReady,
            vectorSchemaReady: finalMeta.vectorSchemaReady,
            lastAiError: finalMeta.lastAiError,
            tokenUsage: finalMeta.tokenUsage,
            sqlitePageCount: (databaseSize.prepare('PRAGMA page_count').get() as { page_count: number }).page_count,
            sqlitePageSize: (databaseSize.prepare('PRAGMA page_size').get() as { page_size: number }).page_size,
          }
        } finally {
          databaseSize.close()
        }

        const batchReports = report.batches as Array<{ settleMs: number; enqueueMs: number; createdCount: number }>
        const searchReports = report.searches as Array<{ vectorHits: number; pureVectorHits: number; durationMs: number }>
        const finalSummary = report.summary as { totalBlocks: number; totalVectors: number; statusBreakdown: Array<{ status: string; total: number }>; vectorSchemaReady: boolean }

        if (batchReports.length > 1) {
          const first = batchReports[0]
          const last = batchReports[batchReports.length - 1]
          ;(report.analysis as Record<string, unknown>) = {
            firstBatchSettleMs: first.settleMs,
            lastBatchSettleMs: last.settleMs,
            settleGrowthRatio: first.settleMs > 0 ? round(last.settleMs / first.settleMs) : null,
            averageSearchMs: round(searchReports.reduce((sum, item) => sum + item.durationMs, 0) / Math.max(searchReports.length, 1)),
            averageVectorHits: round(searchReports.reduce((sum, item) => sum + item.vectorHits, 0) / Math.max(searchReports.length, 1)),
            averagePureVectorHits: round(searchReports.reduce((sum, item) => sum + item.pureVectorHits, 0) / Math.max(searchReports.length, 1)),
          }
        }

        if (finalSummary.totalVectors !== finalSummary.totalBlocks) {
          ;(report.issues as Array<Record<string, unknown>>).push({
            stage: 'summary',
            type: 'vector-coverage-mismatch',
            totalBlocks: finalSummary.totalBlocks,
            totalVectors: finalSummary.totalVectors,
          })
        }

        if (!finalSummary.vectorSchemaReady) {
          ;(report.issues as Array<Record<string, unknown>>).push({
            stage: 'summary',
            type: 'vector-schema-not-ready-final',
          })
        }

        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        console.log(`STRESS_REPORT_PATH=${REPORT_PATH}`)
        console.log(`STRESS_TEMP_DIRECTORY=${tempDirectory}`)
        console.log(`STRESS_SUMMARY=${JSON.stringify(report.summary)}`)

        expect(finalSummary.totalBlocks).toBe(TOTAL_BLOCKS)
      } finally {
        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        context.dispose()
      }
    },
    60 * 60 * 1000,
  )
})
