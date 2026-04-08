import type { AppContext } from './appContext'
import type { Block, SearchResult, TagSuggestion } from '../shared/types'

interface CliError {
  code: string
  message: string
}

function previewText(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function getBlockTitle(block: Block): string {
  return block.summary?.trim() || previewText(block.content, 42) || '未命名块'
}

function toBlockSummary(block: Block) {
  return {
    id: block.id,
    title: getBlockTitle(block),
    summary: block.summary?.trim() || null,
    preview: previewText(block.content),
    tags: block.tags.map((tag) => tag.name),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status: block.status,
    aiMode: block.aiMode,
  }
}

function toBlockDetail(block: Block) {
  return {
    id: block.id,
    title: getBlockTitle(block),
    summary: block.summary?.trim() || null,
    content: block.content,
    tags: block.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      source: tag.source,
      kind: tag.kind,
      isDefault: tag.isDefault,
    })),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status: block.status,
    aiMode: block.aiMode,
    errorMessage: block.errorMessage ?? null,
  }
}

function toSearchEntry(result: SearchResult) {
  return {
    ...toBlockSummary(result.block),
    score: result.score,
    matchSource: result.matchSource,
  }
}

function toTagEntry(tag: TagSuggestion) {
  return {
    id: tag.id,
    name: tag.name,
    kind: tag.kind,
    isDefault: tag.isDefault,
  }
}

function printHelp(): void {
  process.stdout.write(`长布 CLI\n\n`)
  process.stdout.write(`用法:\n`)
  process.stdout.write(`  changbu-notes search "<query>" [--limit N] [--json]\n`)
  process.stdout.write(`  changbu-notes tag "<tagName>" [--limit N] [--json]\n`)
  process.stdout.write(`  changbu-notes get <blockId> [--json]\n`)
  process.stdout.write(`  changbu-notes list [--offset N] [--limit N] [--json]\n`)
  process.stdout.write(`  changbu-notes create "<content>" [--json]\n`)
  process.stdout.write(`  changbu-notes update <blockId> "<content>" [--json]\n`)
  process.stdout.write(`  changbu-notes remove <blockId> [--json]\n`)
  process.stdout.write(`  changbu-notes tags [--query text] [--json]\n`)
  process.stdout.write(`  changbu-notes doctor [--json]\n`)
}

function consumeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name)
  if (index === -1) {
    return false
  }

  args.splice(index, 1)
  return true
}

function consumeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }

  const nextValue = args[index + 1]
  if (!nextValue || nextValue.startsWith('--')) {
    throw new Error(`${name} 需要一个值。`)
  }

  args.splice(index, 2)
  return nextValue
}

function parseIntegerOption(args: string[], name: string, fallback: number): number {
  const raw = consumeOption(args, name)

  if (raw === undefined) {
    return fallback
  }

  const nextValue = Number(raw)

  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw new Error(`${name} 必须是非负整数。`)
  }

  return Math.round(nextValue)
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeSuccess(json: boolean, data: unknown, text: () => string): void {
  if (json) {
    writeJson({ ok: true, data })
    return
  }

  process.stdout.write(`${text()}\n`)
}

function writeFailure(json: boolean, error: CliError): void {
  if (json) {
    writeJson({ ok: false, error })
    return
  }

  process.stderr.write(`${error.message}\n`)
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return '未找到结果。'
  }

  return results.map((result, index) => {
    const tags = result.block.tags.map((tag) => tag.name).join('、') || '无标签'
    const sources = result.matchSource.join(' + ') || 'unknown'

    return [
      `[${index + 1}] ${getBlockTitle(result.block)}`,
      `ID: ${result.block.id}`,
      `时间: ${result.block.updatedAt}`,
      `标签: ${tags}`,
      `命中: ${sources}`,
      `摘要: ${result.block.summary?.trim() || previewText(result.block.content)}`,
    ].join('\n')
  }).join('\n\n')
}

function formatBlockDetail(block: Block): string {
  const tags = block.tags.map((tag) => tag.name).join('、') || '无标签'

  return [
    `${getBlockTitle(block)}`,
    `ID: ${block.id}`,
    `创建: ${block.createdAt}`,
    `更新: ${block.updatedAt}`,
    `状态: ${block.status}`,
    `AI: ${block.aiMode}`,
    `标签: ${tags}`,
    '',
    block.content,
  ].join('\n')
}

function formatTagList(tags: TagSuggestion[]): string {
  if (tags.length === 0) {
    return '没有可用标签。'
  }

  return tags.map((tag) => `${tag.name} · ${tag.kind}${tag.isDefault ? ' · 默认' : ''}`).join('\n')
}

function formatBlockList(blocks: Block[]): string {
  if (blocks.length === 0) {
    return '没有块。'
  }

  return blocks.map((block, index) => `[${index + 1}] ${getBlockTitle(block)}\nID: ${block.id}\n更新: ${block.updatedAt}\n标签: ${block.tags.map((tag) => tag.name).join('、') || '无标签'}\n预览: ${previewText(block.content)}`).join('\n\n')
}

async function ensureExternalAccessEnabled(context: AppContext): Promise<void> {
  const status = await context.getExternalAccessStatus()

  if (!status.enabled) {
    throw new Error('外部接入未启用，请先在长布设置 → 外部接入 中启用并生成 CLI / Skill。')
  }
}

export async function runChangbuCli(context: AppContext, rawArgs: string[]): Promise<number> {
  const args = [...rawArgs]

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    return 0
  }

  const json = consumeFlag(args, '--json')
  const command = args.shift()

  try {
    switch (command) {
      case 'doctor': {
        const status = await context.getExternalAccessStatus()
        writeSuccess(json, status, () => {
          const issues = status.issues.length > 0 ? status.issues.join('；') : '无'
          return [
            `外部接入: ${status.enabled ? '已启用' : '未启用'}`,
            `可用状态: ${status.available ? '可用' : '不可用'}`,
            `CLI: ${status.cliPath}`,
            `Skill: ${status.skillDirectory}`,
            `可执行文件: ${status.executablePath}`,
            `问题: ${issues}`,
          ].join('\n')
        })
        return 0
      }
      case 'search': {
        await ensureExternalAccessEnabled(context)
        const limit = parseIntegerOption(args, '--limit', 5)
        const query = args.join(' ').trim()

        if (!query) {
          throw new Error('search 需要一个查询内容。')
        }

        const results = await context.searchBlocks(query, limit)
        writeSuccess(json, results.map(toSearchEntry), () => formatSearchResults(results))
        return 0
      }
      case 'tag': {
        await ensureExternalAccessEnabled(context)
        const limit = parseIntegerOption(args, '--limit', 10)
        const tagName = args.join(' ').trim()

        if (!tagName) {
          throw new Error('tag 需要一个标签名。')
        }

        const results = await context.searchByTag(tagName, limit)
        writeSuccess(json, results.map(toSearchEntry), () => formatSearchResults(results))
        return 0
      }
      case 'get': {
        await ensureExternalAccessEnabled(context)
        const blockId = args[0]?.trim()

        if (!blockId) {
          throw new Error('get 需要一个 blockId。')
        }

        const block = await context.getBlock(blockId)
        writeSuccess(json, toBlockDetail(block), () => formatBlockDetail(block))
        return 0
      }
      case 'list': {
        await ensureExternalAccessEnabled(context)
        const offset = parseIntegerOption(args, '--offset', 0)
        const limit = parseIntegerOption(args, '--limit', 10)
        const blocks = await context.listBlocks({ offset, limit })
        writeSuccess(json, blocks.map(toBlockSummary), () => formatBlockList(blocks))
        return 0
      }
      case 'create': {
        await ensureExternalAccessEnabled(context)
        const content = args.join(' ').trim()

        if (!content) {
          throw new Error('create 需要一段内容。')
        }

        const block = await context.createBlock(content)
        writeSuccess(json, toBlockDetail(block), () => `已创建块：${block.id}\n${formatBlockDetail(block)}`)
        return 0
      }
      case 'update': {
        await ensureExternalAccessEnabled(context)
        const blockId = args.shift()?.trim()
        const content = args.join(' ').trim()

        if (!blockId) {
          throw new Error('update 需要一个 blockId。')
        }

        if (!content) {
          throw new Error('update 需要新的内容。')
        }

        const block = await context.updateBlock(blockId, content)
        writeSuccess(json, toBlockDetail(block), () => `已更新块：${block.id}\n${formatBlockDetail(block)}`)
        return 0
      }
      case 'remove': {
        await ensureExternalAccessEnabled(context)
        const blockId = args[0]?.trim()

        if (!blockId) {
          throw new Error('remove 需要一个 blockId。')
        }

        await context.removeBlock(blockId)
        writeSuccess(json, { removed: true, id: blockId }, () => `已删除块：${blockId}`)
        return 0
      }
      case 'tags': {
        await ensureExternalAccessEnabled(context)
        const query = consumeOption(args, '--query')
        const tags = await context.listTags(query)
        writeSuccess(json, tags.map(toTagEntry), () => formatTagList(tags))
        return 0
      }
      default:
        if (!json) {
          printHelp()
        }
        writeFailure(json, {
          code: 'UNKNOWN_COMMAND',
          message: `未知命令：${command}`,
        })
        return 1
    }
  } catch (error) {
    writeFailure(json, {
      code: 'CLI_ERROR',
      message: error instanceof Error ? error.message : '执行失败。',
    })
    return 1
  }
}
