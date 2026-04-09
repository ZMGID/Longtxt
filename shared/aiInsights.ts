import type { AiInsightMethodId, AppLanguage } from './types'

export type AiInsightIconKey = 'spark' | 'compass' | 'flip' | 'orbit' | 'pattern' | 'persona'

export interface AiInsightMethodDefinition {
  id: AiInsightMethodId
  label: string
  authorLabel: string
  description: string
  iconKey: AiInsightIconKey
  promptPreset: string
}

interface AiInsightMethodBaseDefinition {
  id: AiInsightMethodId
  iconKey: AiInsightIconKey
}

interface AiInsightMethodText {
  label: string
  authorLabel: string
  description: string
  promptPreset: string
}

const AI_INSIGHT_METHOD_BASE: AiInsightMethodBaseDefinition[] = [
  {
    id: 'default-insight',
    iconKey: 'spark',
  },
  {
    id: 'values-clarification',
    iconKey: 'compass',
  },
  {
    id: 'reverse-thinking',
    iconKey: 'flip',
  },
  {
    id: 'second-order-thinking',
    iconKey: 'orbit',
  },
  {
    id: 'cbt-patterns',
    iconKey: 'pattern',
  },
  {
    id: 'mbti-analysis',
    iconKey: 'persona',
  },
]

const AI_INSIGHT_METHOD_TEXT: Record<AppLanguage, Record<AiInsightMethodId, AiInsightMethodText>> = {
  zh: {
    'default-insight': {
      label: '默认洞察',
      authorLabel: '通用框架',
      description: '快速梳理最近两周的主题、节奏变化和仍然没有收束的线索。',
      promptPreset: '先抓主线，再判断节奏和阻力，最后指出最值得继续追的两三个方向。',
    },
    'values-clarification': {
      label: '价值澄清',
      authorLabel: '价值视角',
      description: '从反复投入的事项里看清什么真正重要，什么只是顺手被卷进去。',
      promptPreset: '识别最近两周里反复投入时间和注意力的主题，区分真正重视的东西与被动消耗。',
    },
    'reverse-thinking': {
      label: '逆向思考',
      authorLabel: '反向拆解',
      description: '先看哪些做法会把局面继续拖慢，再反过来提炼更有效的动作。',
      promptPreset: '用逆向思考拆解：如果要让接下来更糟，延续哪些模式就够了；再反推出更好的做法。',
    },
    'second-order-thinking': {
      label: '二阶思考',
      authorLabel: '长期后果',
      description: '不只看眼前推进了什么，也看这些动作后面会带来什么连锁影响。',
      promptPreset: '分析短期收益之外的二阶影响：哪些动作正在制造后续成本，哪些动作在累积复利。',
    },
    'cbt-patterns': {
      label: 'CBT 疗法',
      authorLabel: '模式识别',
      description: '从事件、想法和行动模式中识别更稳的替代路径，但不要诊断化。',
      promptPreset: '仅基于文字样本，观察事件—解释—行动的重复模式，给出更稳的替代看法与动作。',
    },
    'mbti-analysis': {
      label: 'MBTI 分析',
      authorLabel: '偏好线索',
      description: '从最近样本里观察工作偏好和决策风格，但不要把它写成确定的人格结论。',
      promptPreset: '只把 MBTI 当成描述偏好的语言，不做定型判断，重点解释当下更顺手的工作方式。',
    },
  },
  en: {
    'default-insight': {
      label: 'Default Insight',
      authorLabel: 'General Lens',
      description: 'Quickly map the major themes, rhythm shifts, and unresolved threads from the last two weeks.',
      promptPreset: 'Start with the main thread, then identify momentum and friction, and end with 2-3 tracks worth pursuing.',
    },
    'values-clarification': {
      label: 'Values Clarification',
      authorLabel: 'Values Lens',
      description: 'Distinguish what truly matters from what simply absorbs your attention by inertia.',
      promptPreset: 'Identify recurring attention themes in the last two weeks and separate true priorities from passive consumption.',
    },
    'reverse-thinking': {
      label: 'Reverse Thinking',
      authorLabel: 'Reverse Lens',
      description: 'Start by spotting patterns that would worsen outcomes, then invert them into better moves.',
      promptPreset: 'Use inversion: what patterns would make things worse if continued, and what better actions does that imply?',
    },
    'second-order-thinking': {
      label: 'Second-Order Thinking',
      authorLabel: 'Long-Term Lens',
      description: 'Look beyond immediate progress and analyze downstream effects.',
      promptPreset: 'Focus on second-order effects: which actions create future costs and which actions compound gains.',
    },
    'cbt-patterns': {
      label: 'CBT Patterns',
      authorLabel: 'Pattern Lens',
      description: 'Observe repeated event-thought-action loops and suggest steadier alternatives without diagnosis.',
      promptPreset: 'Based only on text samples, detect repeated event-interpretation-action patterns and offer steadier alternatives.',
    },
    'mbti-analysis': {
      label: 'MBTI Signals',
      authorLabel: 'Preference Lens',
      description: 'Infer work preferences and decision style from recent samples without fixed personality claims.',
      promptPreset: 'Use MBTI language only as a preference lens, not a fixed label; explain what work style fits best right now.',
    },
  },
}

function getLocalizedMethodDefinition(
  method: AiInsightMethodBaseDefinition,
  language: AppLanguage,
): AiInsightMethodDefinition {
  const textGroup = AI_INSIGHT_METHOD_TEXT[language] ?? AI_INSIGHT_METHOD_TEXT.zh
  const text = textGroup[method.id]
  return {
    ...method,
    ...text,
  }
}

export function getAiInsightMethodDefinitions(language: AppLanguage = 'zh'): AiInsightMethodDefinition[] {
  return AI_INSIGHT_METHOD_BASE.map((method) => getLocalizedMethodDefinition(method, language))
}

export const AI_INSIGHT_METHODS: AiInsightMethodDefinition[] = getAiInsightMethodDefinitions('zh')

export function getAiInsightMethodDefinition(
  id: AiInsightMethodId | string | null | undefined,
  language: AppLanguage = 'zh',
): AiInsightMethodDefinition | null {
  if (!id) {
    return null
  }

  const method = AI_INSIGHT_METHOD_BASE.find((item) => item.id === id)
  return method ? getLocalizedMethodDefinition(method, language) : null
}

export function isAiInsightMethodId(value: string | null | undefined): value is AiInsightMethodId {
  return AI_INSIGHT_METHOD_BASE.some((method) => method.id === value)
}
