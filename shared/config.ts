import type { AIConfig } from './types'

export const APP_NAME = '长布'

export const DEFAULT_PAGE_SIZE = 200

export const DEFAULT_AI_CONFIG: AIConfig = {
  llm: {
    endpoint: '',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  embedding: {
    endpoint: '',
    apiKey: '',
    model: 'text-embedding-3-small',
  },
}
