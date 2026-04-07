import type { AIExecutionMode, Block, DocGenerationChunk } from '../shared/types'
import type { LLMProvider } from './services/ai'
import { streamDocumentGeneration } from './services/docgen'

interface StartStreamedDocumentGenerationTaskOptions {
  requestId: string
  topic: string
  blocks: Block[]
  llmProvider: LLMProvider
  mode: AIExecutionMode
  temperature: number
  maxOutputTokens: number
  writingGuide?: string | null
  onChunk: (chunk: DocGenerationChunk) => void
  onLiveDelta?: () => void
  onError?: (error: unknown) => void
  onSettled?: () => void
}

export async function startStreamedDocumentGenerationTask({
  requestId,
  topic,
  blocks,
  llmProvider,
  mode,
  temperature,
  maxOutputTokens,
  writingGuide,
  onChunk,
  onLiveDelta,
  onError,
  onSettled,
}: StartStreamedDocumentGenerationTaskOptions): Promise<void> {
  try {
    for await (const chunk of streamDocumentGeneration(requestId, topic, blocks, llmProvider, mode, {
      writingGuide,
      temperature,
      maxTokens: maxOutputTokens,
    })) {
      if (mode === 'live' && chunk.delta) {
        onLiveDelta?.()
      }

      onChunk(chunk)
    }
  } catch (error) {
    onError?.(error)

    onChunk({
      requestId,
      topic,
      delta: '',
      done: true,
      mode,
      error: error instanceof Error ? error.message : '文档生成失败。',
    })
  } finally {
    onSettled?.()
  }
}
