/**
 * AI 消息构建函数。
 *
 * 将 LLM 请求的 system/user 消息组装逻辑集中在此，
 * 与 HTTP 请求层、数据净化层解耦。
 */
import type {
  TagSuggestionInput,
  ChatMessage,
  ChatContentPart,
  DailyReviewGenerationInput,
  AiInsightGenerationInput,
  CalendarSuggestionExtractionInput,
} from './ai-types'

/* 多模态探测用最小 PNG 图片 */
const PROBE_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII='

function buildTagSuggestionOutputFormat(multimodal: boolean): string {
  return multimodal
    ? '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结","image_annotations":[{"index":0,"annotation":"图片内容批注"}]}。'
    : '请基于用户输入内容输出严格 JSON，格式为 {"categories":["分类1"],"detail_tags":["细标签1","细标签2"],"summary":"简短总结"}。'
}

function buildTagSuggestionInstructions(formatDescription: string, options: { multimodal: boolean; fallbackToTextOnly: boolean }): string {
  return [
    '你是长布的标签分配助手。',
    formatDescription,
    '分类标签用于大类归档，数量 1 到 3 个。',
    '细标签用于体现块里具体在说什么，数量 1 到 5 个，必须具体，优先名词性内容标签。',
    'summary 是这个块的一句简短总结，用于连接图和块预览，尽量控制在 12 到 30 个汉字之间。',
    options.multimodal
      ? '如果输入里附带图片，请结合图片与文本生成 image_annotations。index 必须对应图片顺序，从 0 开始。annotation 是可用于检索和打标签的简短图片内容批注。'
      : '如果原文里出现图片 Markdown / 图片链接，但这次没有真实图片输入，不能假装看到了图片，只能依据 alt、URL 和上下文谨慎描述。',
    options.fallbackToTextOnly ? '本次图片未被实际分析，禁止虚构图片细节。' : '',
    '细标签要尽量体现设备、产品、考试、方法、概念、项目对象、资料主题等具体内容。',
    '不要用空泛标签替代具体内容，例如不要只写"学习""生活""工具"来代替块里真正的对象。',
    '分类标签允许更概括，但细标签必须具体。',
    '优先复用给定的分类候选、细标签记忆和用户标签。',
    '不要把用户标签原样机械复制进输出，只有内容确实匹配时才复用。',
    '不要输出解释、不要输出 Markdown、不要输出额外字段。',
  ].filter(Boolean).join('\n')
}

function buildTextOnlyTagSuggestionUserContent(input: TagSuggestionInput, options: { fallbackToTextOnly: boolean }): string {
  return [
    `分类候选：${input.categoryCandidates.join('、') || '无'}`,
    `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
    `用户标签记忆：${input.userTags.join('、') || '无'}`,
    input.images?.length
      ? `图片输入状态：未发送真实图片，共 ${input.images.length} 张图片${input.skippedImages ? `，另有 ${input.skippedImages} 张跳过` : ''}。`
      : '图片输入状态：无图片。',
    options.fallbackToTextOnly ? '说明：本次只能依据图片 alt / URL / 上下文推断，不能假装已经看图。' : '',
    '',
    '内容如下：',
    input.content,
  ].filter(Boolean).join('\n')
}

function buildMultimodalTagSuggestionUserContent(input: TagSuggestionInput): ChatContentPart[] {
  const parts: ChatContentPart[] = [
    {
      type: 'text',
      text: [
        `分类候选：${input.categoryCandidates.join('、') || '无'}`,
        `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
        `用户标签记忆：${input.userTags.join('、') || '无'}`,
        `真实图片输入：${input.images?.length ?? 0} 张${input.skippedImages ? `，另有 ${input.skippedImages} 张因限制或格式问题未发送` : ''}。`,
        '',
        '文字内容如下：',
        input.content,
      ].join('\n'),
    },
  ]

  for (const image of input.images ?? []) {
    parts.push({
      type: 'text',
      text: `图片 index=${image.index}，alt=${image.altText?.trim() || '无'}。请据此返回对应 image_annotations 条目。`,
    })
    parts.push({
      type: 'image_url',
      image_url: {
        url: image.url,
      },
    })
  }

  return parts
}

export function buildTagSuggestionMessages(input: TagSuggestionInput, options: { multimodal: boolean; fallbackToTextOnly: boolean }): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        buildTagSuggestionOutputFormat(options.multimodal),
        options,
      ),
    },
    {
      role: 'user',
      content: options.multimodal
        ? buildMultimodalTagSuggestionUserContent(input)
        : buildTextOnlyTagSuggestionUserContent(input, { fallbackToTextOnly: options.fallbackToTextOnly }),
    },
  ]
}

export function buildBatchTagSuggestionMessages(inputs: TagSuggestionInput[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: buildTagSuggestionInstructions(
        '请基于用户输入内容输出严格 JSON，格式为 {"items":[{"index":0,"categories":["分类1"],"detail_tags":["细标签1"],"summary":"简短总结"}]}。',
        {
          multimodal: false,
          fallbackToTextOnly: false,
        },
      ),
    },
    {
      role: 'user',
      content: inputs.map((input, index) => [
        `块索引：${index}`,
        `分类候选：${input.categoryCandidates.join('、') || '无'}`,
        `细标签记忆：${input.detailCandidates.join('、') || '无'}`,
        `用户标签记忆：${input.userTags.join('、') || '无'}`,
        '',
        '内容如下：',
        input.content,
      ].join('\n')).join('\n\n---\n\n'),
    },
  ]
}

export function buildCalendarSuggestionMessages(input: CalendarSuggestionExtractionInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是长布的日历计划提取助手。',
        '你的任务是从用户笔记中提取明确的未来安排，只输出严格 JSON。',
        '输出格式必须为 {"items":[{"title":"安排标题","date":"YYYY-MM-DD","start_time":"HH:mm或null","all_day":true,"notes":"补充说明或null","confidence":0.9,"evidence_text":"原文证据"}]}。',
        '只提取明确面向未来、且日期可确定的安排。',
        '如果没有明确日期，不要输出任何条目。',
        '允许解析"今天/明天/后天/本周X/下周X/M月D日/YYYY-MM-DD"等相对或显式日期，但必须换算成 YYYY-MM-DD。',
        '如果原文没有明确时间，start_time 设为 null，all_day 设为 true。',
        '如果原文有明确时间，start_time 用 24 小时制 HH:mm，all_day 设为 false。',
        '不要猜测含糊意图；例如"改天""之后""有空再说"都不能提取。',
        'title 保持简洁明确，notes 用于补充上下文，evidence_text 引用原文中的关键信息片段。',
        '不要输出解释、不要输出 Markdown、不要输出 JSON 以外的内容。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `参考日期：${input.referenceDate}`,
        `时区：${input.timezone}`,
        `最多输出：${Math.max(0, Math.round(input.maxSuggestions ?? 3))} 条`,
        '',
        '内容如下：',
        input.content,
      ].join('\n'),
    },
  ]
}

export function buildMultimodalProbeMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a connectivity probe. Reply with OK if you can read the image input.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Reply with OK only after reading the attached image.',
        },
        {
          type: 'image_url',
          image_url: {
            url: PROBE_IMAGE_DATA_URL,
          },
        },
      ],
    },
  ]
}

export function buildDocumentMessages(topic: string, blocks: import('../../shared/types').Block[], writingGuide?: string | null): ChatMessage[] {
  const grouped = new Map<string, string[]>()

  for (const block of blocks) {
    const key = block.tags[0]?.name ?? '未分类'
    const current = grouped.get(key) ?? []
    current.push(block.content.trim())
    grouped.set(key, current)
  }

  const sections = Array.from(grouped.entries())
    .map(([tag, entries], index) => {
      const lines = entries.map((entry, entryIndex) => `${entryIndex + 1}. ${entry}`).join('\n')
      return `分组 ${index + 1}｜${tag}\n${lines}`
    })
    .join('\n\n')

  return [
    {
      role: 'system',
      content: [
        '你是长布的笔记整理助手。',
        '你的任务是严格基于用户提供的原始块内容，整理成结构化 Markdown 文档。',
        '只能做整理、归纳、排序、补过渡，不允许补充原始块中不存在的事实。',
        '不要臆测用户动机、平台目标或测试结论；如果原文没写，就不要补。',
        '保持原始术语、模型名、产品名和技术名，不要替换或泛化。',
        '不要把 "live" 自动解释成"生产环境"；如果需要提到它，直接写 "live" 或 "live 模式"。',
        '不要补充测试时间、测试范围、环境级别、性能结论等原文没有提供的信息。',
        '如果信息不足，请明确写"信息不足"，不要猜测。',
        '当原始块较少时，输出保持简洁，不要为了完整而扩写成长篇背景介绍。',
        '输出必须是 Markdown，至少包含：标题、摘要、按主题分节的正文、待确认项或下一步。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `主题：${topic}`,
        '',
        ...(writingGuide
          ? [
              '以下是当前笔记本整理出的写作指令与编排提示。它们用于约束结构和表达，不属于事实引用，请先遵守这些提示：',
              writingGuide,
              '',
            ]
          : []),
        '以下是已召回并按标签聚类后的原始块，请基于它们整理文档。请优先复述和组织块中的事实，不要自己补背景：',
        sections || '没有召回到块，请输出一份说明信息不足的短文档。',
      ].join('\n'),
    },
  ]
}

export function buildDailyReviewMessages(input: DailyReviewGenerationInput): ChatMessage[] {
  if (input.language === 'en') {
    const blockSection = input.blocks.length > 0
      ? input.blocks.map((block, index) => [
        `Block ${index + 1}`,
        `Time: ${block.createdAt}`,
        `Tags: ${block.tags.join(', ') || 'none'}`,
        `Summary: ${block.summary?.trim() || 'none'}`,
        `Preview: ${block.preview}`,
        'Content:',
        block.content,
      ].join('\n')).join('\n\n---\n\n')
      : 'No note blocks for today.'

    const entrySection = input.entries.length > 0
      ? input.entries.map((entry, index) => [
        `Entry ${index + 1}`,
        `Title: ${entry.title}`,
        `Time: ${entry.allDay ? 'all day' : entry.startTime ?? 'time not set'}`,
        `Status: ${entry.status}`,
        `Notes: ${entry.notes ?? 'none'}`,
      ].join('\n')).join('\n\n')
      : 'No calendar entries for today.'

    return [
      {
        role: 'system',
        content: [
          'You are Changbu\'s daily review assistant.',
          'Write a Markdown daily review strictly based on today\'s note blocks and calendar entries.',
          'Keep the tone natural and grounded. Do not fabricate events, conclusions, feelings, motives, or outcomes.',
          'If context is insufficient, explicitly say so.',
          'Do not output code fences or JSON.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Date: ${input.date}`,
          `Blocks: ${input.blockCount}`,
          `Calendar: ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`,
          `Top tags: ${input.topTags.join(', ') || 'none'}`,
          '',
          'Calendar entries:',
          entrySection,
          '',
          'Note blocks:',
          blockSection,
        ].join('\n'),
      },
    ]
  }

  const blockSection = input.blocks.length > 0
    ? input.blocks.map((block, index) => [
      `块 ${index + 1}`,
      `时间：${block.createdAt}`,
      `标签：${block.tags.join('、') || '无'}`,
      `摘要：${block.summary?.trim() || '无'}`,
      `预览：${block.preview}`,
      '正文：',
      block.content,
    ].join('\n')).join('\n\n---\n\n')
    : '今天没有块内容。'

  const entrySection = input.entries.length > 0
    ? input.entries.map((entry, index) => [
      `安排 ${index + 1}`,
      `标题：${entry.title}`,
      `时间：${entry.allDay ? '全天' : entry.startTime ?? '未写时间'}`,
      `状态：${entry.status}`,
      `备注：${entry.notes ?? '无'}`,
    ].join('\n')).join('\n\n')
    : '今天没有日历安排。'

  return [
    {
      role: 'system',
      content: [
        '你是长布的每日回顾助手。',
        '你的任务是严格根据当天块内容和当天日历安排，写一篇中文 Markdown 每日回顾正文。',
        '风格应自然、克制、像一篇可阅读的长文日记，不要写成汇报模板、问卷、清单或空洞鸡汤。',
        '只能整理、串联、概括用户已经写下来的事实与安排，不允许补充原始内容中不存在的事件、结论、心情、动机或结果。',
        '如果信息不足，就明确写出信息不足，不要编造细节。',
        '允许使用少量二级或三级标题，但不要套模板，不要把标签列表原样照抄成正文。',
        '不要输出代码块围栏，不要输出 JSON，不要写"以下是每日回顾"之类说明语。',
        '正文需要兼顾两部分：一是这一天实际记下了什么，二是日历安排如何影响这一天的节奏。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `日期：${input.date}`,
        `当天块数：${input.blockCount}`,
        `日历安排：计划 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`,
        `当天主题：${input.topTags.join('、') || '暂无明显主题'}`,
        '',
        '以下是当天日历：',
        entrySection,
        '',
        '以下是当天块内容：',
        blockSection,
      ].join('\n'),
    },
  ]
}

export function buildAiInsightMessages(input: AiInsightGenerationInput): ChatMessage[] {
  if (input.language === 'en') {
    const daySection = input.dayDigests.length > 0
      ? input.dayDigests.map((day, index) => [
        `Day ${index + 1}`,
        `Date: ${day.date}`,
        `Blocks: ${day.blockCount}`,
        `Themes: ${day.topTags.join(', ') || 'none'}`,
        `Previews: ${day.previews.join('; ') || 'none'}`,
        `Calendar: ${day.plannedEntryCount} planned, ${day.doneEntryCount} done, ${day.canceledEntryCount} canceled`,
      ].join('\n')).join('\n\n')
      : 'No day-level records in this period.'

    const blockSection = input.blocks.length > 0
      ? input.blocks.map((block, index) => [
        `Reference block ${index + 1}`,
        `Date: ${block.date}`,
        `Time: ${block.createdAt}`,
        `Tags: ${block.tags.join(', ') || 'none'}`,
        `Summary: ${block.summary?.trim() || 'none'}`,
        `Preview: ${block.preview}`,
        'Content:',
        block.content,
      ].join('\n')).join('\n\n---\n\n')
      : 'No reference blocks in this period.'

    const entrySection = input.entries.length > 0
      ? input.entries.map((entry, index) => [
        `Entry ${index + 1}`,
        `Date: ${entry.date}`,
        `Title: ${entry.title}`,
        `Time: ${entry.allDay ? 'all day' : entry.startTime ?? 'time not set'}`,
        `Status: ${entry.status}`,
        `Notes: ${entry.notes ?? 'none'}`,
      ].join('\n')).join('\n\n')
      : 'No calendar entries in this period.'

    return [
      {
        role: 'system',
        content: [
          'You are Changbu\'s AI insight assistant.',
          'Write a Markdown insight strictly from note blocks and calendar entries in the last two weeks.',
          'Do not fabricate facts. Any interpretation must remain probabilistic.',
          'If using CBT/MBTI language, keep it observational and non-diagnostic.',
          'Do not output code fences or JSON.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Method: ${input.methodLabel}`,
          `Method requirement: ${input.promptPreset}`,
          `Anchor date: ${input.anchorDate}`,
          `Range: ${input.rangeStart} to ${input.rangeEnd}`,
          `Blocks in range: ${input.blockCount}`,
          `Calendar in range: ${input.plannedEntryCount} planned, ${input.doneEntryCount} done, ${input.canceledEntryCount} canceled`,
          `Top tags: ${input.topTags.join(', ') || 'none'}`,
          '',
          '14-day day-level summary:',
          daySection,
          '',
          'Key reference blocks:',
          blockSection,
          '',
          'Calendar entries in range:',
          entrySection,
        ].join('\n'),
      },
    ]
  }

  const daySection = input.dayDigests.length > 0
    ? input.dayDigests.map((day, index) => [
      `日期 ${index + 1}`,
      `日期：${day.date}`,
      `块数：${day.blockCount}`,
      `主题：${day.topTags.join('、') || '暂无明显主题'}`,
      `预览：${day.previews.join('；') || '无'}`,
      `安排：计划 ${day.plannedEntryCount} 项，完成 ${day.doneEntryCount} 项，取消 ${day.canceledEntryCount} 项`,
    ].join('\n')).join('\n\n')
    : '最近两周没有日级记录。'

  const blockSection = input.blocks.length > 0
    ? input.blocks.map((block, index) => [
      `引用块 ${index + 1}`,
      `日期：${block.date}`,
      `时间：${block.createdAt}`,
      `标签：${block.tags.join('、') || '无'}`,
      `摘要：${block.summary?.trim() || '无'}`,
      `预览：${block.preview}`,
      '正文：',
      block.content,
    ].join('\n')).join('\n\n---\n\n')
    : '最近两周没有可引用块。'

  const entrySection = input.entries.length > 0
    ? input.entries.map((entry, index) => [
      `安排 ${index + 1}`,
      `日期：${entry.date}`,
      `标题：${entry.title}`,
      `时间：${entry.allDay ? '全天' : entry.startTime ?? '未写时间'}`,
      `状态：${entry.status}`,
      `备注：${entry.notes ?? '无'}`,
    ].join('\n')).join('\n\n')
    : '最近两周没有日历安排。'

  return [
    {
      role: 'system',
      content: [
        '你是长布的 AI 洞察分析助手。',
        '你的任务是严格根据最近两周的块内容和日历安排，按指定分析方法写一篇中文 Markdown 洞察正文。',
        '风格应自然、克制、像一页可阅读的分析文章，不要写成汇报模板、咨询表格、心理测评结果单或空洞鸡汤。',
        '只能整理、串联和解释用户已经写下来的事实，不允许补充原始内容中不存在的事件、结论、关系或结果。',
        '允许做解释性推断，但必须明确写成"可能""更像""看起来""倾向于"之类的表述，不要把推断写成确定事实。',
        '如果使用 CBT 或 MBTI 语言，只能作为观察视角，禁止诊断化、病理化、贴标签或给出确定的人格结论。',
        '允许使用 3 到 5 个二级标题，也可以带少量列表，但不要套固定模板。',
        '不要输出代码块围栏，不要输出 JSON，不要写"以下是分析结果"之类说明语。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `分析方法：${input.methodLabel}`,
        `方法要求：${input.promptPreset}`,
        `锚点日期：${input.anchorDate}`,
        `时间范围：${input.rangeStart} 至 ${input.rangeEnd}`,
        `范围内块数：${input.blockCount}`,
        `范围内日历：计划 ${input.plannedEntryCount} 项，完成 ${input.doneEntryCount} 项，取消 ${input.canceledEntryCount} 项`,
        `高频主题：${input.topTags.join('、') || '暂无明显主题'}`,
        '',
        '以下是 14 天内的日级概览：',
        daySection,
        '',
        '以下是重点引用块：',
        blockSection,
        '',
        '以下是范围内日历安排：',
        entrySection,
      ].join('\n'),
    },
  ]
}
