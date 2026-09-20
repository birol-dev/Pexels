import type { AgentMessage } from '../llm/llm-provider.ts'

export const KEEP_FULL_TOOL_RESULTS = 8
export const TOOL_RESULT_COMPACT_THRESHOLD = 4000

const COMPACTED_TOOL_RESULT = JSON.stringify({
  omitted: true,
  note: 'Earlier tool result trimmed to control context size. Re-run the search if needed.'
})

/**
 * Returns a provider-facing copy of the conversation with older, large tool
 * results replaced by a digest. The input array and its message objects are
 * never mutated, so the persisted transcript stays complete across pause,
 * abort, and resume.
 */
export function compactToolResultsForProvider(messages: AgentMessage[]): AgentMessage[] {
  const toolMessageIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolMessageIndices.push(i)
  }

  const cutoff = toolMessageIndices.length - KEEP_FULL_TOOL_RESULTS
  if (cutoff <= 0) return messages

  const compactAt = new Set<number>()
  for (let i = 0; i < cutoff; i++) {
    const index = toolMessageIndices[i]
    if ((messages[index].content || '').length > TOOL_RESULT_COMPACT_THRESHOLD) {
      compactAt.add(index)
    }
  }
  if (compactAt.size === 0) return messages

  return messages.map((message, index) => {
    if (!compactAt.has(index)) return message
    return { ...message, content: COMPACTED_TOOL_RESULT }
  })
}
