// @vitest-environment node

import Database from 'better-sqlite3'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { CALENDAR_SETTINGS_KEY, DOC_GENERATION_SETTINGS_KEY } from '../../shared/config'
import { createAppContext, type AppContext } from '../appContext'

const contexts: AppContext[] = []
const directories: string[] = []

function makeContext(): { context: AppContext; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'changbu-v2-'))
  directories.push(directory)

  const context = createAppContext({
    dataDirectory: directory,
    openPath: async () => '',
  })

  contexts.push(context)
  return { context, directory }
}

function openDb(directory: string): Database.Database {
  return new Database(join(directory, 'changbu.sqlite3'))
}

afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.dispose()
  }

  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('v2 features', () => {
  it('builds graph data and manages snapshot lifecycle', async () => {
    const { context } = makeContext()

    const first = await context.createBlock('研究 RAG 的检索增强生成思路')
    const second = await context.createBlock('整理 RAG 与向量检索的实验记录')
    await context.whenIdle()
    await context.addTag(first.id, 'AI')
    await context.addTag(second.id, 'AI')

    const graph = await context.getGraphData(['AI'])
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2)
    expect(graph.edges.some((edge) => edge.sharedTags.includes('AI'))).toBe(true)

    const snapshot = await context.saveSnapshot('RAG 总结', '# RAG 总结', [first.id, second.id])
    const listed = await context.listSnapshots()
    expect(listed[0]?.id).toBe(snapshot.id)

    const fetched = await context.getSnapshot(snapshot.id)
    expect(fetched.topic).toBe('RAG 总结')

    await context.removeSnapshot(snapshot.id)
    expect(await context.listSnapshots()).toHaveLength(0)
  })

  it('exports markdown and imports markdown as blocks with enrichment', async () => {
    const { context, directory } = makeContext()
    const block = await context.createBlock('# 标题\n\n这是一条关于 SQLite 和 AI 的 Markdown 记录。')
    await context.whenIdle()

    const exportDirectory = join(directory, 'markdown-export')
    const exportResult = await context.exportMarkdown({
      includeAttachments: true,
      targetPath: exportDirectory,
    })

    expect(exportResult).not.toBeNull()
    expect(exportResult?.count).toBe(1)
    const markdownFiles = readdirSync(exportDirectory).filter((file) => file.endsWith('.md'))
    expect(markdownFiles).toHaveLength(1)

    const { context: importContext } = makeContext()
    const preview = await importContext.previewImportMarkdown([join(exportDirectory, markdownFiles[0])])
    expect(preview).not.toBeNull()
    expect(preview?.totalBlocks).toBe(1)

    const imported = await importContext.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(1)
    await importContext.whenIdle()

    const blocks = await importContext.listBlocks()
    expect(blocks.items).toHaveLength(1)
    expect(blocks.items[0].tags.length).toBeGreaterThan(0)
    expect(blocks.items[0].content).toContain('SQLite')

    void block
  })

  it('exports json backup and imports it with block metadata preserved', async () => {
    const { context, directory } = makeContext()
    const block = await context.createBlock('长布支持按标签浏览和文档快照。')
    await context.whenIdle()
    await context.addTag(block.id, '项目')
    const db = openDb(directory)
    db.prepare(
      `
        UPDATE blocks
        SET summary = ?, status = 'error', ai_mode = 'live', error_message = ?
        WHERE id = ?
      `,
    ).run('保留这条摘要', '备份前的运行错误', block.id)
    db.close()

    const jsonPath = join(directory, 'backup.json')
    const exportResult = await context.exportJson({
      includeAttachments: true,
      targetPath: jsonPath,
    })

    expect(exportResult).not.toBeNull()
    expect(exportResult?.count).toBe(1)
    expect(readFileSync(jsonPath, 'utf8')).toContain('"version": 2')
    expect(readFileSync(jsonPath, 'utf8')).toContain('"summary": "保留这条摘要"')

    const { context: importContext } = makeContext()
    const preview = await importContext.previewImportJson(jsonPath)
    expect(preview).not.toBeNull()
    expect(preview?.totalBlocks).toBe(1)
    expect(preview?.conflicts).toBe(0)

    const imported = await importContext.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(1)
    await importContext.whenIdle()

    const importedBlocks = await importContext.listBlocks()
    expect(importedBlocks.items[0].tags.some((tag) => tag.name === '项目')).toBe(true)
    expect(importedBlocks.items[0].summary).toBe('保留这条摘要')
    expect(importedBlocks.items[0].status).toBe('error')
    expect(importedBlocks.items[0].aiMode).toBe('live')
    expect(importedBlocks.items[0].errorMessage).toBe('备份前的运行错误')
  })

  it('exports complete json backup with settings snapshot and restores it on import', async () => {
    const { context, directory } = makeContext()

    await context.setSetting('ai_config', JSON.stringify({
      llm: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'secret-key',
        model: 'gpt-4.1-mini',
      },
      embedding: {
        endpoint: 'https://api.example.com/v1',
        apiKey: 'embed-key',
        model: 'text-embedding-3-small',
      },
    }))
    await context.setSetting(CALENDAR_SETTINGS_KEY, JSON.stringify({
      aiSuggestionsEnabled: true,
      autoAcceptAiSuggestions: true,
      maxSuggestionsPerBlock: 6,
      upcomingDays: 45,
    }))
    await context.setSetting(DOC_GENERATION_SETTINGS_KEY, JSON.stringify({
      maxReferenceBlocks: 12,
      retrievalLimit: 36,
      temperature: 0.2,
      maxOutputTokens: 1400,
      streamOutput: false,
    }))

    const jsonPath = join(directory, 'complete-backup.json')
    const exportResult = await context.exportJson({
      includeAttachments: true,
      includeSettings: true,
      targetPath: jsonPath,
    })

    expect(exportResult).not.toBeNull()
    expect(readFileSync(jsonPath, 'utf8')).toContain('"version": 3')
    expect(readFileSync(jsonPath, 'utf8')).toContain('"settings"')
    expect(readFileSync(jsonPath, 'utf8')).toContain('"ai_config"')

    const { context: importContext } = makeContext()
    const preview = await importContext.previewImportJson(jsonPath)
    expect(preview).not.toBeNull()
    expect(preview?.includesSettings).toBe(true)
    expect(preview?.settingsEntryCount).toBeGreaterThan(0)

    const imported = await importContext.confirmImport(preview!.importId, 'overwrite_all')
    expect(imported.imported).toBe(0)

    expect(await importContext.getSetting('ai_config')).toContain('secret-key')
    expect(await importContext.getSetting(CALENDAR_SETTINGS_KEY)).toContain('"autoAcceptAiSuggestions":true')
    expect(await importContext.getSetting(DOC_GENERATION_SETTINGS_KEY)).toContain('"streamOutput":false')
  })

  it('treats a date-only end filter as inclusive for exports', async () => {
    const { context, directory } = makeContext()
    const block = await context.createBlock('验证按日期导出时结束日包含当天记录。')
    await context.whenIdle()
    const createdAt = new Date(block.createdAt)
    const localEndDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`

    const jsonPath = join(directory, 'date-filter-backup.json')
    const exportResult = await context.exportJson({
      includeAttachments: true,
      targetPath: jsonPath,
      dateRange: {
        end: localEndDate,
      },
    })

    expect(exportResult).not.toBeNull()
    expect(exportResult?.count).toBe(1)
  })
})
