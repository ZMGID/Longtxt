import type { Block, DocGenerationChunk } from '../../shared/types'
import type { LLMProvider } from './ai'

export async function* streamDocumentGeneration(
  requestId: string,
  topic: string,
  blocks: Block[],
  provider: LLMProvider,
  mode: DocGenerationChunk['mode'],
): AsyncGenerator<DocGenerationChunk> {
  let fullText = ''

  for await (const delta of provider.streamDocument(topic, blocks)) {
    fullText += delta
    yield {
      requestId,
      topic,
      delta,
      done: false,
      mode,
    }
  }

  yield {
    requestId,
    topic,
    delta: '',
    done: true,
    mode,
    fullText,
  }
}
