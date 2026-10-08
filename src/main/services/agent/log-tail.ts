import type { AgentLogEvent } from './agent-runner.ts'

/** Entries kept from a saved run log. The file keeps every line; the screen needs the recent ones. */
export const LOG_TAIL_MAX = 1000
/** Logged data longer than this is replaced by its size. Older runs logged whole search results. */
const MAX_DATA_CHARACTERS = 4000

/**
 * The newest `max` entries of a saved agent-log.jsonl, oldest first. Only those lines are
 * parsed, so a log of many megabytes loads quickly. Lines that are not valid entries are
 * skipped, and large `data` is replaced with `{ truncated: true, characters }`.
 */
export function tailLogEntries(lines: string[], max = LOG_TAIL_MAX): AgentLogEvent[] {
  const entries: AgentLogEvent[] = []
  for (const line of lines.filter((l) => l.trim()).slice(-max)) {
    let entry: unknown
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const event = entry as AgentLogEvent
    if (event.data !== undefined) {
      const characters =
        typeof event.data === 'string' ? event.data.length : JSON.stringify(event.data).length
      if (characters > MAX_DATA_CHARACTERS) event.data = { truncated: true, characters }
    }
    entries.push(event)
  }
  return entries
}
