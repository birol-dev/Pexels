import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentMessage } from '../src/main/services/llm/llm-provider.ts'
import {
  compactToolResultsForProvider,
  KEEP_FULL_TOOL_RESULTS,
  TOOL_RESULT_COMPACT_THRESHOLD
} from '../src/main/services/agent/message-compaction.ts'

function toolMessage(id: string, content: string): AgentMessage {
  return { role: 'tool', tool_call_id: id, name: 'search_pexels_photos', content }
}

describe('compactToolResultsForProvider', () => {
  it('does not mutate the persisted transcript', () => {
    const originalContent = 'x'.repeat(TOOL_RESULT_COMPACT_THRESHOLD + 20)
    const messages: AgentMessage[] = [
      { role: 'user', content: 'start' },
      ...Array.from({ length: KEEP_FULL_TOOL_RESULTS + 2 }, (_, i) =>
        toolMessage(`call_${i}`, originalContent)
      )
    ]
    const snapshot = messages.map((message) => message.content)

    const compacted = compactToolResultsForProvider(messages)

    assert.notEqual(compacted, messages)
    assert.deepEqual(
      messages.map((message) => message.content),
      snapshot
    )
    assert.match(compacted[1].content || '', /"omitted":true/)
    assert.equal(compacted[compacted.length - 1].content, originalContent)
  })

  it('leaves history unchanged when there are few tool results', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'start' },
      toolMessage('call_1', 'x'.repeat(TOOL_RESULT_COMPACT_THRESHOLD + 5))
    ]
    assert.equal(compactToolResultsForProvider(messages), messages)
  })
})
