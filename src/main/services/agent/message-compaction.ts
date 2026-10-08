import type { AgentMessage } from '../llm/llm-provider.ts'
import { slugFromPexelsUrl } from './tool-results.ts'

/** Results from the newest turns are never compacted, however large. */
export const KEEP_FULL_TOOL_TURNS = 3
export const TOOL_RESULT_COMPACT_THRESHOLD = 4000
/** About 40,000 tokens at 4 characters per token. */
export const CONTEXT_BUDGET_CHARS = 160_000

/** Index of every assistant message that called tools. Each starts a turn: the call and its results. */
function turnStarts(messages: AgentMessage[]): number[] {
  const starts: number[] = []
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && message.tool_calls?.length) starts.push(index)
  })
  return starts
}

/**
 * Returns a provider-facing copy of the conversation with large tool results before
 * `index` replaced by a digest. The input array and its message objects are never
 * mutated, so the persisted transcript stays complete across pause, abort, and resume.
 */
export function compactBefore(messages: AgentMessage[], index: number): AgentMessage[] {
  let changed = false
  const out = messages.map((message, i) => {
    if (
      i >= index ||
      message.role !== 'tool' ||
      (message.content || '').length <= TOOL_RESULT_COMPACT_THRESHOLD
    ) {
      return message
    }
    changed = true
    return { ...message, content: digestToolResult(message.content || '') }
  })
  return changed ? out : messages
}

/**
 * The message index to compact before so the conversation fits `targetChars`: the
 * oldest turn start that gets it there, or 0 when it already fits. Whole turns go
 * together, since one batched turn can hold a dozen results that belong together.
 * It never passes the newest `keepTurns` turns, however large they are.
 */
export function cutoffForHalfBudget(
  messages: AgentMessage[],
  targetChars: number,
  keepTurns: number
): number {
  const starts = turnStarts(messages)
  if (starts.length <= keepTurns) return 0
  const newestAllowed = starts[starts.length - keepTurns]

  if (JSON.stringify(messages).length <= targetChars) return 0
  for (const start of starts) {
    if (start >= newestAllowed) break
    if (JSON.stringify(compactBefore(messages, start)).length <= targetChars) return start
  }
  return newestAllowed
}

/**
 * What to send for the next request, and the cutoff to keep for the one after it.
 * The cutoff only moves when the request would cross the budget, and then in one
 * step down to half of it. Between steps the compacted prefix stays identical, so
 * the provider's prompt cache keeps hitting.
 */
export function compactForRequest(
  messages: AgentMessage[],
  compactedBefore: number,
  budgetChars = CONTEXT_BUDGET_CHARS
): { view: AgentMessage[]; compactedBefore: number } {
  const view = compactBefore(messages, compactedBefore)
  if (JSON.stringify(view).length <= budgetChars) return { view, compactedBefore }

  const cutoff = cutoffForHalfBudget(messages, budgetChars / 2, KEEP_FULL_TOOL_TURNS)
  // Nothing older than the newest turns is left to compact.
  if (cutoff <= compactedBefore) return { view, compactedBefore }
  return { view: compactBefore(messages, cutoff), compactedBefore: cutoff }
}

/** Keeps what the model needs to select an earlier result: ids and descriptions. */
export function digestToolResult(content: string): string {
  try {
    const parsed = JSON.parse(content) as { results?: Array<Record<string, unknown>> } | null
    if (Array.isArray(parsed?.results)) {
      return JSON.stringify({
        compacted: true,
        results: parsed.results.map((result) => [result.pexelsId, describe(result)])
      })
    }
  } catch {
    // Not JSON; fall through to the generic stub.
  }
  return JSON.stringify({ compacted: true, note: 'Earlier tool result trimmed to save space.' })
}

/** Handles both result shapes: `about` (slim results) and `alt`/`url` (saved conversations from before). */
function describe(result: Record<string, unknown>): string {
  const text =
    (typeof result.about === 'string' && result.about) ||
    (typeof result.alt === 'string' && result.alt) ||
    slugFromPexelsUrl(String(result.url || ''))
  return text.slice(0, 60)
}
