import type { AiInsightMethodId } from './types'

export type AiInsightIconKey = 'spark' | 'compass' | 'flip' | 'orbit' | 'pattern' | 'persona'

export interface AiInsightMethodDefinition {
  id: AiInsightMethodId
  label: string
  authorLabel: string
  description: string
  iconKey: AiInsightIconKey
  promptPreset: string
}

export const AI_INSIGHT_METHODS: AiInsightMethodDefinition[] = [
  {
    id: 'default-insight',
    label: '默认洞察',
    authorLabel: '通用框架',
    description: '快速梳理最近两周的主题、节奏变化和仍然没有收束的线索。',
    iconKey: 'spark',
    promptPreset: '先抓主线，再判断节奏和阻力，最后指出最值得继续追的两三个方向。',
  },
  {
    id: 'values-clarification',
    label: '价值澄清',
    authorLabel: '价值视角',
    description: '从反复投入的事项里看清什么真正重要，什么只是顺手被卷进去。',
    iconKey: 'compass',
    promptPreset: '识别最近两周里反复投入时间和注意力的主题，区分真正重视的东西与被动消耗。',
  },
  {
    id: 'reverse-thinking',
    label: '逆向思考',
    authorLabel: '反向拆解',
    description: '先看哪些做法会把局面继续拖慢，再反过来提炼更有效的动作。',
    iconKey: 'flip',
    promptPreset: '用逆向思考拆解：如果要让接下来更糟，延续哪些模式就够了；再反推出更好的做法。',
  },
  {
    id: 'second-order-thinking',
    label: '二阶思考',
    authorLabel: '长期后果',
    description: '不只看眼前推进了什么，也看这些动作后面会带来什么连锁影响。',
    iconKey: 'orbit',
    promptPreset: '分析短期收益之外的二阶影响：哪些动作正在制造后续成本，哪些动作在累积复利。',
  },
  {
    id: 'cbt-patterns',
    label: 'CBT 疗法',
    authorLabel: '模式识别',
    description: '从事件、想法和行动模式中识别更稳的替代路径，但不要诊断化。',
    iconKey: 'pattern',
    promptPreset: '仅基于文字样本，观察事件—解释—行动的重复模式，给出更稳的替代看法与动作。',
  },
  {
    id: 'mbti-analysis',
    label: 'MBTI 分析',
    authorLabel: '偏好线索',
    description: '从最近样本里观察工作偏好和决策风格，但不要把它写成确定的人格结论。',
    iconKey: 'persona',
    promptPreset: '只把 MBTI 当成描述偏好的语言，不做定型判断，重点解释当下更顺手的工作方式。',
  },
]

export function getAiInsightMethodDefinition(id: AiInsightMethodId | string | null | undefined): AiInsightMethodDefinition | null {
  if (!id) {
    return null
  }

  return AI_INSIGHT_METHODS.find((method) => method.id === id) ?? null
}

export function isAiInsightMethodId(value: string | null | undefined): value is AiInsightMethodId {
  return AI_INSIGHT_METHODS.some((method) => method.id === value)
}
