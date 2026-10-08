import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentMessage } from '../src/main/services/llm/llm-provider.ts'
import {
  compactBefore,
  compactForRequest,
  CONTEXT_BUDGET_CHARS,
  cutoffForHalfBudget,
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

function toolMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => message.role === 'tool')
}

function turnStartsOf(messages: AgentMessage[]): number[] {
  return messages.flatMap((m, i) => (m.role === 'assistant' && m.tool_calls?.length ? [i] : []))
}

const sizeOf = (messages: AgentMessage[]): number => JSON.stringify(messages).length

describe('compactBefore', () => {
  it('does not mutate the persisted transcript', () => {
    const messages = turns(4)
    const snapshot = messages.map((message) => message.content)

    const compacted = compactBefore(messages, messages.length)

    assert.notEqual(compacted, messages)
    assert.deepEqual(
      messages.map((message) => message.content),
      snapshot
    )
    assert.ok(compacted.every((message) => message.role !== 'tool' || isCompacted(message)))
  })

  it('returns the same array when the cutoff is 0 or nothing before it is large', () => {
    const messages = turns(4)
    assert.equal(compactBefore(messages, 0), messages)

    const small = messages.map((m) => (m.role === 'tool' ? { ...m, content: '{"results":[]}' } : m))
    assert.equal(compactBefore(small, small.length), small)
  })

  it('compacts the results before the cutoff and nothing from it on', () => {
    const messages = turns(4)
    const cutoff = turnStartsOf(messages)[1]

    const results = toolMessages(compactBefore(messages, cutoff))

    assert.ok(isCompacted(results[0]))
    for (const result of results.slice(1)) assert.ok(!isCompacted(result))
  })

  it('compacts every result of an older turn together', () => {
    const batched = turn(
      0,
      Array.from({ length: 6 }, (_, i) => bulkyContent(i * 10))
    )
    const recent = turn(100, [bulkyContent(1000)])
    const messages = [{ role: 'user' as const, content: 'start' }, ...batched, ...recent]

    const results = toolMessages(compactBefore(messages, turnStartsOf(messages)[1]))

    assert.equal(results.length, 7)
    for (const result of results.slice(0, 6)) assert.ok(isCompacted(result))
    assert.ok(!isCompacted(results[6]))
  })

  it('names every result of a compacted turn in the digest, so each can still be selected', () => {
    const messages = turns(2)

    const [oldest] = toolMessages(compactBefore(messages, messages.length))

    assert.deepEqual(JSON.parse(oldest.content || ''), {
      compacted: true,
      results: [0, 1, 2, 3, 4].map((id) => [id, `Alt text ${id}`])
    })
  })

  it('never touches a short result, however old', () => {
    const messages = turns(4)
    messages[2] = { ...messages[2], content: '{"results":[{"pexelsId":7,"alt":"short"}]}' }

    const compacted = compactBefore(messages, messages.length)

    assert.equal(compacted[2], messages[2])
    assert.ok(isCompacted(compacted[4]))
  })
})

describe('cutoffForHalfBudget', () => {
  it('is 0 when the conversation already fits', () => {
    const messages = turns(6)
    assert.equal(cutoffForHalfBudget(messages, sizeOf(messages), KEEP_FULL_TOOL_TURNS), 0)
  })

  it('is 0 while there are no more turns than the protected ones, however large', () => {
    const contents = Array.from({ length: 12 }, (_, i) => bulkyContent(i * 10))
    const batched = [{ role: 'user' as const, content: 'start' }, ...turn(0, contents)]
    assert.equal(cutoffForHalfBudget(batched, 1, KEEP_FULL_TOOL_TURNS), 0)

    const few = turns(KEEP_FULL_TOOL_TURNS)
    assert.equal(cutoffForHalfBudget(few, 1, KEEP_FULL_TOOL_TURNS), 0)
  })

  it('stops at the oldest turn start that gets the conversation under the target', () => {
    const messages = turns(12)
    const target = Math.floor(sizeOf(messages) * 0.4)
    const starts = turnStartsOf(messages)

    const cutoff = cutoffForHalfBudget(messages, target, KEEP_FULL_TOOL_TURNS)

    assert.ok(starts.includes(cutoff), 'a cutoff is the start of a turn')
    assert.ok(cutoff < starts[starts.length - KEEP_FULL_TOOL_TURNS], 'it did not need the limit')
    assert.ok(sizeOf(compactBefore(messages, cutoff)) <= target)
    const earlier = starts[starts.indexOf(cutoff) - 1]
    assert.ok(sizeOf(compactBefore(messages, earlier)) > target, 'an earlier cutoff is not enough')
  })

  it('never passes the newest protected turns when the target cannot be met', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS + 3)
    const starts = turnStartsOf(messages)

    const cutoff = cutoffForHalfBudget(messages, 1, KEEP_FULL_TOOL_TURNS)

    assert.equal(cutoff, starts[starts.length - KEEP_FULL_TOOL_TURNS])
    const results = toolMessages(compactBefore(messages, cutoff))
    for (const result of results.slice(-KEEP_FULL_TOOL_TURNS)) assert.ok(!isCompacted(result))
    for (const result of results.slice(0, -KEEP_FULL_TOOL_TURNS)) assert.ok(isCompacted(result))
  })
})

describe('compactForRequest', () => {
  it('sends the conversation untouched and keeps the cutoff while it is under budget', () => {
    const messages = turns(8)

    const next = compactForRequest(messages, 0, sizeOf(messages))

    assert.equal(next.view, messages)
    assert.equal(next.compactedBefore, 0)
  })

  it('does not move the cutoff on the default budget for an ordinary job', () => {
    const messages = turns(12)
    assert.ok(sizeOf(messages) < CONTEXT_BUDGET_CHARS)

    assert.equal(compactForRequest(messages, 0).compactedBefore, 0)
  })

  it('moves the cutoff once when the budget is crossed, then holds it for the next turn', () => {
    const messages = turns(12)
    const budget = Math.floor(sizeOf(messages) * 0.95)

    const first = compactForRequest(messages, 0, budget)

    assert.ok(first.compactedBefore > 0, 'the budget was crossed')
    assert.ok(sizeOf(first.view) <= budget / 2, 'one step goes down to half the budget')

    // One more turn arrives. The request is still under budget, so the cutoff stays and
    // the messages that were sent before are sent again, byte for byte.
    const longer = [...messages, ...turn(99, [bulkyContent(9900)])]
    const second = compactForRequest(longer, first.compactedBefore, budget)

    assert.equal(second.compactedBefore, first.compactedBefore)
    assert.deepEqual(second.view.slice(0, first.view.length), first.view)
    assert.equal(
      JSON.stringify(second.view.slice(0, first.view.length)),
      JSON.stringify(first.view)
    )
  })

  it('keeps the compacted prefix for as many turns as fit under the budget', () => {
    const messages = turns(12)
    const budget = Math.floor(sizeOf(messages) * 0.95)
    let state = compactForRequest(messages, 0, budget)
    const firstCutoff = state.compactedBefore
    const firstView = state.view

    let grown = messages
    for (let n = 0; n < 3; n++) {
      grown = [...grown, ...turn(100 + n, [bulkyContent(10_000 + n * 100)])]
      state = compactForRequest(grown, state.compactedBefore, budget)
      assert.equal(state.compactedBefore, firstCutoff, `turn ${n + 1} after the step`)
      assert.deepEqual(state.view.slice(0, firstView.length), firstView)
    }
  })

  it('never compacts the newest turns, even when they alone are over budget', () => {
    const messages = turns(KEEP_FULL_TOOL_TURNS + 2)

    const next = compactForRequest(messages, 0, 1000)

    const results = toolMessages(next.view)
    for (const result of results.slice(-KEEP_FULL_TOOL_TURNS)) assert.ok(!isCompacted(result))
    for (const result of results.slice(0, -KEEP_FULL_TOOL_TURNS)) assert.ok(isCompacted(result))
    const starts = turnStartsOf(messages)
    assert.equal(next.compactedBefore, starts[starts.length - KEEP_FULL_TOOL_TURNS])
  })

  it('never hides the results of the turn that just arrived', () => {
    let messages = turns(1)
    let cutoff = 0
    for (let n = 1; n < 10; n++) {
      messages = [...messages, ...turn(n, [bulkyContent(n * 100)])]
      const next = compactForRequest(messages, cutoff, 1000)
      cutoff = next.compactedBefore
      const newest = toolMessages(next.view).at(-1)
      assert.ok(newest && !isCompacted(newest), `turn ${n + 1}`)
    }
  })

  it('never moves the cutoff back, and applies an earlier one while under budget', () => {
    const messages = turns(8)
    const cutoff = turnStartsOf(messages)[4]

    const next = compactForRequest(messages, cutoff, sizeOf(messages))

    assert.equal(next.compactedBefore, cutoff)
    assert.deepEqual(next.view, compactBefore(messages, cutoff))
    assert.equal(toolMessages(next.view).filter(isCompacted).length, 4)
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
