/**
 * Mock AI 生成函数。
 *
 * 包括 mock 文档、每日回顾、AI 洞察的内容生成，以及 mock embedding
 * 所需的 textToVector / chunkText 工具函数。
 */
import { getAiInsightMethodDefinition } from '../../shared/aiInsights'
import type { AppLanguage, Block } from '../../shared/types'
import type {
  DailyReviewGenerationInput,
  AiInsightGenerationInput,
} from './ai-types'

export function textToVector(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0)

  for (let index = 0; index < text.length; index += 1) {
    const position = index % vector.length
    vector[position] = Number(((vector[position] + text.charCodeAt(index)) / 255).toFixed(6))
  }

  return vector
}

export function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = []

  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }

  return chunks
}

export function buildMockDocument(topic: string, blocks: Block[], writingGuide?: string | null): string {
  if (blocks.length === 0) {
    return [
      `# 关于「${topic}」的整理`,
      '',
      '## 当前状态',
      '还没有找到可用的记录片段，所以这是一份空白骨架。',
      ...(writingGuide
        ? [
            '',
            '## 编排提示',
            writingGuide,
          ]
        : []),
      '',
      '## 下一步建议',
      '- 先在时间轴里录入几条与主题相关的块。',
      '- 再次点击"生成文档"，验证检索与编排链路。',
    ].join('\n')
  }

  const grouped = new Map<string, Block[]>()

  for (const block of blocks) {
    const groupName = block.tags[0]?.name ?? '未分类'
    const current = grouped.get(groupName) ?? []
    current.push(block)
    grouped.set(groupName, current)
  }

  const sections = Array.from(grouped.entries()).map(([tag, items]) => {
    const bulletList = items
      .slice(0, 4)
      .map((item) => `- ${item.content.trim().replace(/\n+/g, ' ')}`)
      .join('\n')

    return [`## 主题线索：${tag}`, bulletList].join('\n')
  })

  return [
    `# 关于「${topic}」的整理`,
    '',
    '## 摘要',
    `这是一份由长布骨架版生成的模拟文档，共整理 ${blocks.length} 条相关记录。当前输出用于验证检索、聚合和流式展示链路。`,
    ...(writingGuide
      ? [
          '',
          '## 编排提示',
          writingGuide,
        ]
      : []),
    '',
    ...sections,
    '',
    '## 下一步',
    '- 根据这些块继续补充事实和例子。',
    '- 等真实 LLM 接入后，用同一接口替换当前 mock 输出。',
  ].join('\n')
}

export function formatEntryTimeLabel(
  entry: DailyReviewGenerationInput['entries'][number],
  language: AppLanguage,
): string {
  if (entry.allDay || !entry.startTime) {
    return language === 'en' ? 'all day' : '全天'
  }

  return entry.startTime
}

export function buildMockDailyReview(input: DailyReviewGenerationInput): string {
  if (input.language === 'en') {
    const tagText = input.topTags.length > 0 ? input.topTags.map((tag) => `#${tag}`).join(', ') : 'no stable themes yet'
    const firstParagraph = [
      `On ${input.date}, there were ${input.blockCount} notes recorded.`,
      input.entries.length > 0
        ? ` Calendar had ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, and ${input.canceledEntryCount} canceled items.`
        : ' There were no extra calendar events, so the rhythm mainly came from notes.',
      ` Main themes were around ${tagText}.`,
    ].join('')

    const entryParagraph = input.entries.length > 0
      ? `Calendar split the day into a few clear checkpoints: ${input.entries
        .slice(0, 5)
        .map((entry) => `${formatEntryTimeLabel(entry, input.language)} "${entry.title}" ${entry.status === 'done' ? 'was completed' : entry.status === 'canceled' ? 'was later canceled' : 'remained an important task'}`)
        .join(', ')}.`
      : 'Without fixed schedule entries, the day looked more like continuous progress: capture thoughts, write notes, then gradually merge loose threads.'

    const blockParagraphs = input.blocks.slice(0, 4).map((block, index) => {
      const tagLabel = block.tags.length > 0 ? ` and it connected with ${block.tags.slice(0, 3).join(', ')}` : ''
      return `${index === 0 ? 'Most visible first was' : 'Then came'} "${block.preview}"${tagLabel}. It preserved a concrete focus segment from today and made the day more than a timeline of events.`
    })

    const closingParagraph = input.blockCount > 0
      ? 'Taken together, this day was not defined by one single event. It was a day of parallel threads, some already landed and some still in draft form, but now clearly visible as a whole.'
      : 'There are still no concrete note blocks today, so this remains a placeholder page waiting for real records.'

    return [
      firstParagraph,
      entryParagraph,
      ...blockParagraphs,
      closingParagraph,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  const tagText = input.topTags.length > 0 ? input.topTags.map((tag) => `#${tag}`).join('、') : '暂时还没有形成特别稳定的主题'
  const firstParagraph = [
    `${input.date} 这一天一共留下了 ${input.blockCount} 条记录，`,
    input.entries.length > 0
      ? `同时还有 ${input.plannedEntryCount} 项待办、${input.doneEntryCount} 项完成、${input.canceledEntryCount} 项取消的安排。`
      : '这一天没有额外的日历安排，节奏主要体现在笔记本身。',
    `从内容上看，今天更靠近 ${tagText} 这些线索。`,
  ].join('')

  const entryParagraph = input.entries.length > 0
    ? `日历上的安排把这一天切成了几个清晰的节点：${input.entries
      .slice(0, 5)
      .map((entry) => `${formatEntryTimeLabel(entry, input.language)}的「${entry.title}」${entry.status === 'done' ? '已经完成' : entry.status === 'canceled' ? '后来取消了' : '仍然是今天的重要安排'}`)
      .join('，')}。`
    : '因为没有排定的日历事项，这一天更像是一种连续推进：想到什么、记下什么，再慢慢把零散的线头拢到一起。'

  const blockParagraphs = input.blocks.slice(0, 4).map((block, index) => {
    const tagLabel = block.tags.length > 0 ? `，也能看出它和 ${block.tags.slice(0, 3).join('、')} 这些主题相关` : ''
    return `${index === 0 ? '回看内容，最先浮出来的是' : '接着是'}"${block.preview}"${tagLabel}。这条记录把今天的一段具体注意力留了下来，也让整天的脉络不只是安排表上的几个时间点。`
  })

  const closingParagraph = input.blockCount > 0
    ? `把这些块串起来看，今天并不是被单一事件定义的一天，而是几条线索并行推进的一天。它们有的已经落地，有的还停在草稿和提醒的阶段，但合在一起，已经能看出这一天真正被什么占据。`
    : '今天还没有留下具体块内容，所以现在更像是一个空白的页脚：结构已经在，真正的叙述还要等你把这一天写下来。'

  return [
    firstParagraph,
    entryParagraph,
    ...blockParagraphs,
    closingParagraph,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildAiInsightLead(input: AiInsightGenerationInput): {
  methodLabel: string
  tagsLabel: string
  busiestDayLabel: string
  newestPreview: string
  entryLabel: string
  reviewSpanLabel: string
} {
  const method = getAiInsightMethodDefinition(input.methodId, input.language)
  const isEnglish = input.language === 'en'
  const tagsLabel = input.topTags.length > 0
    ? input.topTags.map((tag) => `#${tag}`).join(isEnglish ? ', ' : '、')
    : isEnglish ? 'no stable themes yet' : '还没有稳定成型的主题'
  const busiestDay = [...input.dayDigests].sort((left, right) => right.blockCount - left.blockCount || right.date.localeCompare(left.date))[0]
  const newestPreview = input.blocks[0]?.preview ?? (isEnglish ? 'no clearly highlighted note thread in this period yet' : '这段时间还没有留下明显的块线索')
  const entryLabel = input.entries.length > 0
    ? isEnglish
      ? `${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`
      : `安排 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`
    : isEnglish ? 'no extra calendar schedule in this period' : '这段时间没有额外的日历安排'

  return {
    methodLabel: method?.label ?? input.methodLabel,
    tagsLabel,
    busiestDayLabel: busiestDay
      ? isEnglish
        ? `${busiestDay.date} (${busiestDay.blockCount} blocks)`
        : `${busiestDay.date}（${busiestDay.blockCount} 条块）`
      : isEnglish ? 'no obvious peak day' : '暂无明显高峰日',
    newestPreview,
    entryLabel,
    reviewSpanLabel: isEnglish ? `${input.rangeStart} to ${input.rangeEnd}` : `${input.rangeStart} 至 ${input.rangeEnd}`,
  }
}

export function buildMockAiInsight(input: AiInsightGenerationInput): string {
  const lead = buildAiInsightLead(input)
  const previewList = input.blocks.slice(0, 3).map((block) => `- ${block.date} · ${block.preview}`).join('\n') || (input.language === 'en' ? '- No highlighted blocks yet' : '- 暂无重点块')

  if (input.language === 'en') {
    return [
      `## Core signal under "${lead.methodLabel}"`,
      `Across ${lead.reviewSpanLabel}, recurring attention still clusters around ${lead.tagsLabel}. The highest-density day was ${lead.busiestDayLabel}.`,
      '',
      '## What this likely means now',
      `Calendar rhythm (${lead.entryLabel}) shaped timing, but note content still explains where sustained cognitive load went.`,
      '',
      '## Most actionable thread',
      `If only one thread should be pushed next, start from the one that appears repeatedly and is already concrete enough to execute. Current representative sample: "${lead.newestPreview}".`,
      '',
      '## Evidence from recent samples',
      previewList,
    ].join('\n')
  }

  switch (input.methodId) {
    case 'values-clarification':
      return [
        '## 反复投入说明了什么',
        `在「${lead.methodLabel}」视角下看，${lead.reviewSpanLabel} 这段时间里，注意力最稳定地落在 ${lead.tagsLabel} 这些主题上。比起一次性的突发任务，更值得注意的是你愿意持续回到这些线索上，说明它们更接近"真正重要"的事项，而不只是顺手处理。`,
        '',
        '## 哪些事情更像被动消耗',
        `从节奏上看，最容易把注意力拖散的不是单个任务，而是来回切换带来的残留负担。${lead.entryLabel} 让时间被切成几个节点，但真正占住脑力的往往还是块里反复出现的主题。当前最醒目的例子是「${lead.newestPreview}」。`,
        '',
        '## 现在更值得保护的投入',
        '如果接下来只能保住少数几条线索，优先级应该给那些既反复出现、又已经形成具体记录的方向，而不是临时冒出来却没有延续的事项。可以把它们理解为：你已经用时间投票过的主题。',
        '',
        '## 这两周的样本依据',
        previewList,
      ].join('\n')
    case 'reverse-thinking':
      return [
        '## 如果要让接下来更糟',
        `最直接的办法就是继续让 ${lead.tagsLabel} 这些线索处在"想到了就记一笔，但不做收束"的状态。这样短期看似没有停下，长期却会让每条线都停在半完成。`,
        '',
        '## 风险其实已经露头',
        `从最近样本看，最典型的风险不是完全没做，而是做了很多局部推进，却没有及时把高频主题并轨。高峰日出现在 ${lead.busiestDayLabel}，说明注意力并不缺，缺的是把推进结果压缩成下一步动作的动作。`,
        '',
        '## 反过来最有效的做法',
        '与其追求再多加几条新线，不如每次只选一条已经反复出现的主题，把它推进到"可交付、可回顾、可继续"的状态。逆向来看，能避免变糟的关键不是更努力，而是减少并行扩张。',
        '',
        '## 当前最值得先收束的线索',
        previewList,
      ].join('\n')
    case 'second-order-thinking':
      return [
        '## 短期上看起来有效的动作',
        `最近两周里，你已经把不少时间投入到 ${lead.tagsLabel} 上，短期收益是推进感更强、上下文更完整，尤其是像「${lead.newestPreview}」这样的记录，会立刻带来清晰感。`,
        '',
        '## 二阶影响更值得看',
        `但二阶后果不只取决于有没有推进，还取决于推进方式。如果这些事项总在高峰日集中爆发、平时缺少收束，它们后面会持续制造切换成本。${lead.entryLabel} 本身不是问题，真正的问题是它们是否把后续行动组织出来。`,
        '',
        '## 哪些动作正在积累复利',
        '凡是同时满足"反复出现""有明确块记录""能接到下一步"的动作，都在积累复利。它们会让未来的检索、回顾和安排越来越省力；相反，只留下碎片而没有承接的动作，会把成本推迟到以后。',
        '',
        '## 接下来值得提前布置的后手',
        previewList,
      ].join('\n')
    case 'cbt-patterns':
      return [
        '## 这批记录里常见的触发点',
        `仅从最近两周样本看，触发写作和安排的核心还是 ${lead.tagsLabel} 这些主题。它们不像偶发情绪，更像稳定存在的任务压力或关注对象。`,
        '',
        '## 可能反复出现的自动化解释',
        '当同一类事情反复出现、却又没有及时收束时，人很容易产生"我一直在推进，但好像总差一点"的自动化判断。这个判断未必准确，却会让注意力继续被未完成感牵着走。',
        '',
        '## 更稳的替代动作',
        '比起继续扩大输入，更有效的做法可能是给每条高频线索补一个"现在算推进到哪里"的明确句子。这样能把模糊压力转换成可操作的下一步，也更能中断那种一直悬着的感觉。',
        '',
        '## 当前样本里的依据',
        previewList,
      ].join('\n')
    case 'mbti-analysis':
      return [
        '## 这批样本显出的工作偏好',
        '以下只是根据最近两周文字样本做的偏好观察，不是人格定论。整体看，你更像是通过持续记录来维持思路清晰的人：先把线索捕捉下来，再慢慢压缩成更稳定的结构。',
        '',
        '## 什么环境会更顺手',
        `当主题相对集中、上下文能被连续保留时，你的推进质量会更高。${lead.entryLabel} 说明外部节奏是存在的，但真正决定产出的，仍然是有没有足够连续的整理空间。`,
        '',
        '## 需要搭配的补位方式',
        '如果说这类偏好最大的风险，就是容易把很多线索都先收进来，再慢慢处理。补位方式不是压掉记录欲，而是更早做取舍：哪些线索要继续喂养，哪些只需要留档就好。',
        '',
        '## 最近最能代表偏好的记录',
        previewList,
      ].join('\n')
    case 'default-insight':
    default:
      return [
        '## 这两周主要被什么占据',
        `从整体样本看，最近两周最稳定的主线仍然是 ${lead.tagsLabel}。这些主题不是偶尔出现，而是在不同日期里持续回流，说明它们已经构成了当前阶段真正的注意力骨架。`,
        '',
        '## 节奏在哪些地方被推快或拖慢',
        `高峰日出现在 ${lead.busiestDayLabel}，说明推进并不缺爆发力。真正影响节奏的，更像是是否有足够时间把爆发后的内容收束成下一步。${lead.entryLabel} 为这段时间提供了节拍，但块里的内容才决定了节拍是否变成结果。`,
        '',
        '## 现在最值得继续追的线索',
        `如果只看一个最应该继续追的方向，那会是已经多次出现、又开始形成具体表述的线索。像「${lead.newestPreview}」这样的内容，已经不只是灵感，而是接近可以继续深化的工作单元。`,
        '',
        '## 当前样本里的重点依据',
        previewList,
      ].join('\n')
  }
}
