import type { AgentMessage } from '../llm/llm-provider.ts'

/** Results from the newest turns are never compacted, however large. */
export const KEEP_FULL_TOOL_TURNS = 3
export const TOOL_RESULT_COMPACT_THRESHOLD = 4000

/**
 * Returns a provider-facing copy of the conversation with older, large tool
 * results replaced by a digest. A turn is an assistant message that called tools
 * together with the results that follow it, so the dozen results of one batched
 * turn are kept or compacted together. The input array and its message objects
 * are never mutated, so the persisted transcript stays complete across pause,
 * abort, and resume.
 */
export function compactToolResultsForProvider(messages: AgentMessage[]): AgentMessage[] {
  const turnStarts: number[] = []
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && message.tool_calls?.length) turnStarts.push(index)
  })
  if (turnStarts.length <= KEEP_FULL_TOOL_TURNS) return messages
  const keepFrom = turnStarts[turnStarts.length - KEEP_FULL_TOOL_TURNS]

  let changed = false
  const out = messages.map((message, index) => {
    if (
      index >= keepFrom ||
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

/** "https://www.pexels.com/video/waves-crashing-on-rocks-1234/" gives "waves crashing on rocks". */
export function slugFromPexelsUrl(url: string): string {
  const last = url.split('/').filter(Boolean).pop() || ''
  return last
    .replace(/-?\d+$/, '')
    .replace(/-/g, ' ')
    .trim()
}
