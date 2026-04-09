import type { AppContext } from './appContext'
import type { AppLanguage, Block, SearchResult, TagSuggestion } from '../shared/types'

interface CliError {
  code: string
  message: string
}

type CliTextKey =
  | 'appTitle'
  | 'usage'
  | 'missingOptionValue'
  | 'invalidIntegerOption'
  | 'untitledBlock'
  | 'noSearchResults'
  | 'noTags'
  | 'noBlocks'
  | 'noTagLabel'
  | 'timeLabel'
  | 'tagLabel'
  | 'matchLabel'
  | 'summaryLabel'
  | 'idLabel'
  | 'createdLabel'
  | 'updatedLabel'
  | 'statusLabel'
  | 'aiLabel'
  | 'previewLabel'
  | 'externalAccessDisabled'
  | 'doctorIssuesNone'
  | 'doctorEnabled'
  | 'doctorDisabled'
  | 'doctorAvailable'
  | 'doctorUnavailable'
  | 'doctorExternalAccess'
  | 'doctorAvailability'
  | 'doctorCli'
  | 'doctorSkill'
  | 'doctorExecutable'
  | 'doctorIssues'
  | 'searchNeedQuery'
  | 'tagNeedName'
  | 'getNeedBlockId'
  | 'createNeedContent'
  | 'updateNeedBlockId'
  | 'updateNeedContent'
  | 'removeNeedBlockId'
  | 'createdBlock'
  | 'updatedBlock'
  | 'removedBlock'
  | 'unknownCommand'
  | 'executionFailed'

const CLI_TEXT: Record<AppLanguage, Record<CliTextKey, string>> = {
  zh: {
    appTitle: '长布 CLI',
    usage: '用法',
    missingOptionValue: '__OPTION__ 需要一个值。',
    invalidIntegerOption: '__OPTION__ 必须是非负整数。',
    untitledBlock: '未命名块',
    noSearchResults: '未找到结果。',
    noTags: '没有可用标签。',
    noBlocks: '没有块。',
    noTagLabel: '无标签',
    timeLabel: '时间',
    tagLabel: '标签',
    matchLabel: '命中',
    summaryLabel: '摘要',
    idLabel: 'ID',
    createdLabel: '创建',
    updatedLabel: '更新',
    statusLabel: '状态',
    aiLabel: 'AI',
    previewLabel: '预览',
    externalAccessDisabled: '外部接入未启用，请先在长布设置 → 外部接入 中启用并生成 CLI / Skill。',
    doctorIssuesNone: '无',
    doctorEnabled: '已启用',
    doctorDisabled: '未启用',
    doctorAvailable: '可用',
    doctorUnavailable: '不可用',
    doctorExternalAccess: '外部接入',
    doctorAvailability: '可用状态',
    doctorCli: 'CLI',
    doctorSkill: 'Skill',
    doctorExecutable: '可执行文件',
    doctorIssues: '问题',
    searchNeedQuery: 'search 需要一个查询内容。',
    tagNeedName: 'tag 需要一个标签名。',
    getNeedBlockId: 'get 需要一个 blockId。',
    createNeedContent: 'create 需要一段内容。',
    updateNeedBlockId: 'update 需要一个 blockId。',
    updateNeedContent: 'update 需要新的内容。',
    removeNeedBlockId: 'remove 需要一个 blockId。',
    createdBlock: '已创建块',
    updatedBlock: '已更新块',
    removedBlock: '已删除块',
    unknownCommand: '未知命令：__COMMAND__',
    executionFailed: '执行失败。',
  },
  en: {
    appTitle: 'Changbu CLI',
    usage: 'Usage',
    missingOptionValue: '__OPTION__ requires a value.',
    invalidIntegerOption: '__OPTION__ must be a non-negative integer.',
    untitledBlock: 'Untitled block',
    noSearchResults: 'No results found.',
    noTags: 'No tags available.',
    noBlocks: 'No blocks available.',
    noTagLabel: 'No tags',
    timeLabel: 'Time',
    tagLabel: 'Tags',
    matchLabel: 'Matched',
    summaryLabel: 'Summary',
    idLabel: 'ID',
    createdLabel: 'Created',
    updatedLabel: 'Updated',
    statusLabel: 'Status',
    aiLabel: 'AI',
    previewLabel: 'Preview',
    externalAccessDisabled: 'External access is disabled. Enable and generate CLI/Skill in Changbu Settings -> External Access first.',
    doctorIssuesNone: 'None',
    doctorEnabled: 'Enabled',
    doctorDisabled: 'Disabled',
    doctorAvailable: 'Available',
    doctorUnavailable: 'Unavailable',
    doctorExternalAccess: 'External Access',
    doctorAvailability: 'Availability',
    doctorCli: 'CLI',
    doctorSkill: 'Skill',
    doctorExecutable: 'Executable',
    doctorIssues: 'Issues',
    searchNeedQuery: 'search requires a query string.',
    tagNeedName: 'tag requires a tag name.',
    getNeedBlockId: 'get requires a blockId.',
    createNeedContent: 'create requires content.',
    updateNeedBlockId: 'update requires a blockId.',
    updateNeedContent: 'update requires new content.',
    removeNeedBlockId: 'remove requires a blockId.',
    createdBlock: 'Created block',
    updatedBlock: 'Updated block',
    removedBlock: 'Removed block',
    unknownCommand: 'Unknown command: __COMMAND__',
    executionFailed: 'Execution failed.',
  },
}

function resolveCliLanguage(language: AppLanguage | undefined): AppLanguage {
  return language === 'en' ? 'en' : 'zh'
}

function t(language: AppLanguage, key: CliTextKey, params: Record<string, string> = {}): string {
  const template = CLI_TEXT[language][key]

  return Object.entries(params).reduce((value, [param, nextValue]) => {
    return value.replaceAll(`__${param}__`, nextValue)
  }, template)
}

function previewText(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function getBlockTitle(block: Block, language: AppLanguage): string {
  return block.summary?.trim() || previewText(block.content, 42) || t(language, 'untitledBlock')
}

function toBlockSummary(block: Block, language: AppLanguage) {
  return {
    id: block.id,
    title: getBlockTitle(block, language),
    summary: block.summary?.trim() || null,
    preview: previewText(block.content),
    tags: block.tags.map((tag) => tag.name),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status: block.status,
    aiMode: block.aiMode,
  }
}

function toBlockDetail(block: Block, language: AppLanguage) {
  return {
    id: block.id,
    title: getBlockTitle(block, language),
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

function toSearchEntry(result: SearchResult, language: AppLanguage) {
  return {
    ...toBlockSummary(result.block, language),
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

function printHelp(language: AppLanguage): void {
  process.stdout.write(`${t(language, 'appTitle')}\n\n`)
  process.stdout.write(`${t(language, 'usage')}:\n`)
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

function consumeOption(args: string[], name: string, language: AppLanguage): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }

  const nextValue = args[index + 1]
  if (!nextValue || nextValue.startsWith('--')) {
    throw new Error(t(language, 'missingOptionValue', { OPTION: name }))
  }

  args.splice(index, 2)
  return nextValue
}

function parseIntegerOption(args: string[], name: string, fallback: number, language: AppLanguage): number {
  const raw = consumeOption(args, name, language)

  if (raw === undefined) {
    return fallback
  }

  const nextValue = Number(raw)

  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw new Error(t(language, 'invalidIntegerOption', { OPTION: name }))
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

function formatSearchResults(results: SearchResult[], language: AppLanguage): string {
  if (results.length === 0) {
    return t(language, 'noSearchResults')
  }

  return results.map((result, index) => {
    const tags = result.block.tags.map((tag) => tag.name).join(language === 'en' ? ', ' : '、') || t(language, 'noTagLabel')
    const sources = result.matchSource.join(' + ') || 'unknown'

    return [
      `[${index + 1}] ${getBlockTitle(result.block, language)}`,
      `${t(language, 'idLabel')}: ${result.block.id}`,
      `${t(language, 'timeLabel')}: ${result.block.updatedAt}`,
      `${t(language, 'tagLabel')}: ${tags}`,
      `${t(language, 'matchLabel')}: ${sources}`,
      `${t(language, 'summaryLabel')}: ${result.block.summary?.trim() || previewText(result.block.content)}`,
    ].join('\n')
  }).join('\n\n')
}

function formatBlockDetail(block: Block, language: AppLanguage): string {
  const tags = block.tags.map((tag) => tag.name).join(language === 'en' ? ', ' : '、') || t(language, 'noTagLabel')

  return [
    `${getBlockTitle(block, language)}`,
    `${t(language, 'idLabel')}: ${block.id}`,
    `${t(language, 'createdLabel')}: ${block.createdAt}`,
    `${t(language, 'updatedLabel')}: ${block.updatedAt}`,
    `${t(language, 'statusLabel')}: ${block.status}`,
    `${t(language, 'aiLabel')}: ${block.aiMode}`,
    `${t(language, 'tagLabel')}: ${tags}`,
    '',
    block.content,
  ].join('\n')
}

function formatTagList(tags: TagSuggestion[], language: AppLanguage): string {
  if (tags.length === 0) {
    return t(language, 'noTags')
  }

  return tags.map((tag) => `${tag.name} · ${tag.kind}${tag.isDefault ? ` · ${language === 'en' ? 'default' : '默认'}` : ''}`).join('\n')
}

function formatBlockList(blocks: Block[], language: AppLanguage): string {
  if (blocks.length === 0) {
    return t(language, 'noBlocks')
  }

  return blocks
    .map((block, index) => {
      const tagLabel = block.tags.map((tag) => tag.name).join(language === 'en' ? ', ' : '、') || t(language, 'noTagLabel')
      return [
        `[${index + 1}] ${getBlockTitle(block, language)}`,
        `${t(language, 'idLabel')}: ${block.id}`,
        `${t(language, 'updatedLabel')}: ${block.updatedAt}`,
        `${t(language, 'tagLabel')}: ${tagLabel}`,
        `${t(language, 'previewLabel')}: ${previewText(block.content)}`,
      ].join('\n')
    })
    .join('\n\n')
}

async function ensureExternalAccessEnabled(context: AppContext, language: AppLanguage): Promise<void> {
  const status = await context.getExternalAccessStatus()

  if (!status.enabled) {
    throw new Error(t(language, 'externalAccessDisabled'))
  }
}

export async function runChangbuCli(
  context: AppContext,
  rawArgs: string[],
  options: { language?: AppLanguage } = {},
): Promise<number> {
  const language = resolveCliLanguage(options.language)
  const args = [...rawArgs]

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp(language)
    return 0
  }

  const json = consumeFlag(args, '--json')
  const command = args.shift()

  try {
    switch (command) {
      case 'doctor': {
        const status = await context.getExternalAccessStatus()
        writeSuccess(json, status, () => {
          const issues = status.issues.length > 0 ? status.issues.join(language === 'en' ? '; ' : '；') : t(language, 'doctorIssuesNone')
          return [
            `${t(language, 'doctorExternalAccess')}: ${status.enabled ? t(language, 'doctorEnabled') : t(language, 'doctorDisabled')}`,
            `${t(language, 'doctorAvailability')}: ${status.available ? t(language, 'doctorAvailable') : t(language, 'doctorUnavailable')}`,
            `${t(language, 'doctorCli')}: ${status.cliPath}`,
            `${t(language, 'doctorSkill')}: ${status.skillDirectory}`,
            `${t(language, 'doctorExecutable')}: ${status.executablePath}`,
            `${t(language, 'doctorIssues')}: ${issues}`,
          ].join('\n')
        })
        return 0
      }
      case 'search': {
        await ensureExternalAccessEnabled(context, language)
        const limit = parseIntegerOption(args, '--limit', 5, language)
        const query = args.join(' ').trim()

        if (!query) {
          throw new Error(t(language, 'searchNeedQuery'))
        }

        const results = await context.searchBlocks(query, limit)
        writeSuccess(json, results.map((result) => toSearchEntry(result, language)), () => formatSearchResults(results, language))
        return 0
      }
      case 'tag': {
        await ensureExternalAccessEnabled(context, language)
        const limit = parseIntegerOption(args, '--limit', 10, language)
        const tagName = args.join(' ').trim()

        if (!tagName) {
          throw new Error(t(language, 'tagNeedName'))
        }

        const results = await context.searchByTag(tagName, limit)
        writeSuccess(json, results.map((result) => toSearchEntry(result, language)), () => formatSearchResults(results, language))
        return 0
      }
      case 'get': {
        await ensureExternalAccessEnabled(context, language)
        const blockId = args[0]?.trim()

        if (!blockId) {
          throw new Error(t(language, 'getNeedBlockId'))
        }

        const block = await context.getBlock(blockId)
        writeSuccess(json, toBlockDetail(block, language), () => formatBlockDetail(block, language))
        return 0
      }
      case 'list': {
        await ensureExternalAccessEnabled(context, language)
        const offset = parseIntegerOption(args, '--offset', 0, language)
        const limit = parseIntegerOption(args, '--limit', 10, language)
        let cursor: { createdAt: string; id: string } | null = null
        let skipped = 0
        const blocks: Block[] = []

        while (blocks.length < limit) {
          const page = await context.listBlocks({
            cursor,
            limit: Math.max(limit, 50),
          })

          if (page.items.length === 0) {
            break
          }

          if (skipped + page.items.length <= offset) {
            skipped += page.items.length

            if (!page.nextCursor) {
              break
            }

            cursor = page.nextCursor
            continue
          }

          const sliceStart = Math.max(0, offset - skipped)
          blocks.push(...page.items.slice(sliceStart, sliceStart + (limit - blocks.length)))
          skipped += page.items.length

          if (!page.nextCursor) {
            break
          }

          cursor = page.nextCursor
        }

        writeSuccess(json, blocks.map((block) => toBlockSummary(block, language)), () => formatBlockList(blocks, language))
        return 0
      }
      case 'create': {
        await ensureExternalAccessEnabled(context, language)
        const content = args.join(' ').trim()

        if (!content) {
          throw new Error(t(language, 'createNeedContent'))
        }

        const block = await context.createBlock(content)
        writeSuccess(json, toBlockDetail(block, language), () => `${t(language, 'createdBlock')}: ${block.id}\n${formatBlockDetail(block, language)}`)
        return 0
      }
      case 'update': {
        await ensureExternalAccessEnabled(context, language)
        const blockId = args.shift()?.trim()
        const content = args.join(' ').trim()

        if (!blockId) {
          throw new Error(t(language, 'updateNeedBlockId'))
        }

        if (!content) {
          throw new Error(t(language, 'updateNeedContent'))
        }

        const block = await context.updateBlock(blockId, content)
        writeSuccess(json, toBlockDetail(block, language), () => `${t(language, 'updatedBlock')}: ${block.id}\n${formatBlockDetail(block, language)}`)
        return 0
      }
      case 'remove': {
        await ensureExternalAccessEnabled(context, language)
        const blockId = args[0]?.trim()

        if (!blockId) {
          throw new Error(t(language, 'removeNeedBlockId'))
        }

        await context.removeBlock(blockId)
        writeSuccess(json, { removed: true, id: blockId }, () => `${t(language, 'removedBlock')}: ${blockId}`)
        return 0
      }
      case 'tags': {
        await ensureExternalAccessEnabled(context, language)
        const query = consumeOption(args, '--query', language)
        const tags = await context.listTags(query)
        writeSuccess(json, tags.map(toTagEntry), () => formatTagList(tags, language))
        return 0
      }
      default:
        if (!json) {
          printHelp(language)
        }
        writeFailure(json, {
          code: 'UNKNOWN_COMMAND',
          message: t(language, 'unknownCommand', { COMMAND: command ?? '' }),
        })
        return 1
    }
  } catch (error) {
    writeFailure(json, {
      code: 'CLI_ERROR',
      message: error instanceof Error ? error.message : t(language, 'executionFailed'),
    })
    return 1
  }
}
