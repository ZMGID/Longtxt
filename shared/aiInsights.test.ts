import { describe, expect, it } from 'vitest'

import {
  AI_INSIGHT_METHODS,
  getAiInsightMethodDefinition,
  getAiInsightMethodDefinitions,
  isAiInsightMethodId,
} from './aiInsights'

describe('ai insight method definitions', () => {
  it('keeps a stable id/icon list for default (zh) exports', () => {
    expect(AI_INSIGHT_METHODS.length).toBeGreaterThan(0)
    expect(AI_INSIGHT_METHODS.map((item) => item.id)).toEqual([
      'default-insight',
      'values-clarification',
      'reverse-thinking',
      'second-order-thinking',
      'cbt-patterns',
      'mbti-analysis',
    ])
  })

  it('returns localized method definitions by language', () => {
    const zh = getAiInsightMethodDefinition('default-insight', 'zh')
    const en = getAiInsightMethodDefinition('default-insight', 'en')

    expect(zh?.label).toBe('默认洞察')
    expect(en?.label).toBe('Default Insight')
    expect(zh?.iconKey).toBe(en?.iconKey)
  })

  it('returns null for unknown method ids', () => {
    expect(getAiInsightMethodDefinition('missing-method', 'en')).toBeNull()
  })

  it('returns localized method lists and validates method ids', () => {
    const list = getAiInsightMethodDefinitions('en')
    expect(list.some((item) => item.label === 'Values Clarification')).toBe(true)
    expect(isAiInsightMethodId('values-clarification')).toBe(true)
    expect(isAiInsightMethodId('unknown')).toBe(false)
  })
})
