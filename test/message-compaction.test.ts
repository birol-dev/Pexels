import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentMessage } from '../src/main/services/llm/llm-provider.ts'
import {
  compactToolResultsForProvider,
  digestToolResult,
  KEEP_FULL_TOOL_TURNS,
  TOOL_RESULT_COMPACT_THRESHOLD
} from '../src/main/services/agent/message-compaction.ts'

/** A search result the way saved conversations hold it: bulky, with every download URL. */
function bulkySearchResult(pexelsId: number): Record<string, unknown> {
  return {
    pexelsId,
    url: `https://www.pexels.com/photo/photo-${pexelsId}/`,
    alt: `Alt text ${pexelsId}`,
    downloadableVariants: [{ label: 'original', url: `https://images.example/${'x'.repeat(1200)}` }]
  }
}

/** One search result as a JSON string, large enough to be compacted. */
function bulkyContent(firstId: number, count = 5): string {
  const results = Array.from({ length: count }, (_, i) => bulkySearchResult(firstId + i))
  const content = JSON.stringify({ total_results: 100, results })
  assert.ok(content.length > TOOL_RESULT_COMPACT_THRESHOLD, 'the fixture must be compactable')
  return content
}

/** An assistant message that calls tools, followed by one tool message per call. */
function turn(firstCall: number, contents: string[]): AgentMessage[] {
  const ids = contents.map((_, i) => `call_${firstCall + i}`)
  return [
    {
      role: 'assistant',
      content: null,
      tool_calls: ids.map((id) => ({ id, name: 'search_pexels_photos', arguments: '{}' }))
    },
    ...contents.map(
      (content, i): AgentMessage => ({
        role: 'tool',
        tool_call_id: ids[i],
        name: 'search_pexels_photos',
        content
      })
    )
  ]
}

/** `count` turns of one large result each; turn `n` holds ids `n * 100` and up. */
function turns(count: number): AgentMessage[] {
  const messages: AgentMessage[] = [{ role: 'user', content: 'start' }]
  for (let n = 0; n < count; n++) messages.push(...turn(n, [bulkyContent(n * 100)]))
  return messages
}

function isCompacted(message: AgentMessage): boolean {
  return /"compacted":true/.test(message.content || '')
}

describe('compactToolResultsForProvider', () => {
  it('does not mutate the persisted transcript', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS + 2)
    const snapshot = messages.map((message) => message.content)

    const compacted = compactToolResultsForProvider(messages)

    assert.notEqual(compacted, messages)
    assert.deepEqual(
      messages.map((message) => message.content),
      snapshot
    )
    assert.ok(isCompacted(compacted[2]))
    assert.equal(compacted[compacted.length - 1].content, messages[messages.length - 1].content)
  })

  it('leaves history unchanged while there are few tool turns', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS)
    assert.equal(compactToolResultsForProvider(messages), messages)
  })

  it('never compacts the results of a single turn, however many it has', () => {
    const contents = Array.from({ length: 12 }, (_, i) => bulkyContent(i * 10))
    const messages = [{ role: 'user' as const, content: 'start' }, ...turn(0, contents)]

    assert.equal(compactToolResultsForProvider(messages), messages)
  })

  it('keeps the newest turns whole even when an earlier one is compacted', () => {
    const contents = Array.from({ length: 12 }, (_, i) => bulkyContent(i * 10))
    const messages = [...turns(KEEP_FULL_TOOL_TURNS - 1), ...turn(50, contents)]

    assert.equal(compactToolResultsForProvider(messages), messages)
  })

  it('compacts only the oldest turn once there is one more than the protected ones', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS + 1)

    const compacted = compactToolResultsForProvider(messages)

    const results = compacted.filter((message) => message.role === 'tool')
    assert.equal(results.length, KEEP_FULL_TOOL_TURNS + 1)
    assert.ok(isCompacted(results[0]))
    for (const result of results.slice(1)) assert.ok(!isCompacted(result))
    // The digest names every result of the compacted turn, so each can still be selected.
    assert.deepEqual(JSON.parse(results[0].content || ''), {
      compacted: true,
      results: [0, 1, 2, 3, 4].map((id) => [id, `Alt text ${id}`])
    })
  })

  it('compacts every result of an older turn together', () => {
    const batched = turn(
      0,
      Array.from({ length: 6 }, (_, i) => bulkyContent(i * 10))
    )
    const recent = Array.from({ length: KEEP_FULL_TOOL_TURNS }, (_, n) =>
      turn(100 + n, [bulkyContent(1000 + n * 10)])
    ).flat()
    const messages = [{ role: 'user' as const, content: 'start' }, ...batched, ...recent]

    const compacted = compactToolResultsForProvider(messages)

    const results = compacted.filter((message) => message.role === 'tool')
    assert.equal(results.length, 6 + KEEP_FULL_TOOL_TURNS)
    for (const result of results.slice(0, 6)) assert.ok(isCompacted(result))
    for (const result of results.slice(6)) assert.ok(!isCompacted(result))
  })

  it('never touches a short result, however old', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS + 2)
    messages[2] = { ...messages[2], content: '{"results":[{"pexelsId":7,"alt":"short"}]}' }

    const compacted = compactToolResultsForProvider(messages)

    assert.equal(compacted[2], messages[2])
    assert.ok(isCompacted(compacted[4]))
  })

  it('does not count assistant messages that made no tool calls', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS)
    messages.splice(1, 0, { role: 'assistant', content: 'Thinking out loud.' })
    messages.push({ role: 'assistant', content: 'Done.' })

    assert.equal(compactToolResultsForProvider(messages), messages)
  })
})

describe('digestToolResult', () => {
  it('lists the id and description of every result', () => {
    const digest = JSON.parse(digestToolResult(bulkyContent(10, 3))) as {
      compacted: boolean
      results: unknown[]
    }

    assert.equal(digest.compacted, true)
    assert.deepEqual(digest.results, [
      [10, 'Alt text 10'],
      [11, 'Alt text 11'],
      [12, 'Alt text 12']
    ])
  })

  it('describes a result from the slim shape, the alt text, or the page slug', () => {
    const content = JSON.stringify({
      results: [
        { pexelsId: 1, about: 'waves crashing on rocks' },
        { pexelsId: 2, alt: 'A quiet desk', url: 'https://www.pexels.com/photo/ignored-2/' },
        { pexelsId: 3, url: 'https://www.pexels.com/video/city-street-at-night-3/' }
      ]
    })

    assert.deepEqual(JSON.parse(digestToolResult(content)).results, [
      [1, 'waves crashing on rocks'],
      [2, 'A quiet desk'],
      [3, 'city street at night']
    ])
  })

  it('shortens a long description to 60 characters', () => {
    const content = JSON.stringify({ results: [{ pexelsId: 1, about: 'word '.repeat(40) }] })

    const [[, description]] = JSON.parse(digestToolResult(content)).results
    assert.equal(description.length, 60)
  })

  it('gives anything that is not a list of results the generic stub', () => {
    const stub = { compacted: true, note: 'Earlier tool result trimmed to save space.' }
    for (const content of [
      'not json at all',
      '',
      'null',
      '[1,2,3]',
      '{"status":"selected","selections":[]}',
      '{"results":[null]}'
    ]) {
      assert.deepEqual(JSON.parse(digestToolResult(content)), stub, content)
    }
  })
})
