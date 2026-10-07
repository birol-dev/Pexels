/** Spoken pace used to turn a duration into a word budget. */
const WORDS_PER_SECOND = 2.5
const SLOW_WORDS_PER_SECOND = 2
const FAST_WORDS_PER_SECOND = 2.7

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5
}

const DEFAULT_SECONDS = 60

/**
 * Parse a target-duration label ("30s", "60s", "2-3min", "90 sec", "1.5 minutes", "short",
 * "deep dive") into a [min, max] range of seconds. Unknown input falls back to 60 seconds.
 */
export function parseDurationSeconds(input: string | undefined): [number, number] {
  const text = (input || '').trim().toLowerCase()
  const match = text.match(
    /^(\d+(?:\.\d+)?)(?:\s*[-–to]+\s*(\d+(?:\.\d+)?))?\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?$/
  )

  if (match) {
    const low = Number(match[1])
    const high = match[2] === undefined ? low : Number(match[2])
    const unit = match[3] || 's'
    const scale = unit.startsWith('m') ? 60 : 1
    const range: [number, number] = [Math.min(low, high) * scale, Math.max(low, high) * scale]
    if (range[0] > 0) return range
  }

  if (text.includes('short')) return [30, 30]
  if (text.includes('deep') || text.includes('long')) return [120, 180]
  return [DEFAULT_SECONDS, DEFAULT_SECONDS]
}

function formatSeconds(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} seconds`
  const minutes = Math.round((seconds / 60) * 10) / 10
  return `${minutes} minutes`
}

/** Human-readable word-count guidance for the idea-expansion prompt. */
export function wordGuidanceForDuration(input: string | undefined): string {
  const [minSeconds, maxSeconds] = parseDurationSeconds(input)
  // A fixed length gets a tolerance band; a range already spans the tolerance.
  const isRange = minSeconds !== maxSeconds
  const minWords = roundToFive(minSeconds * (isRange ? WORDS_PER_SECOND : SLOW_WORDS_PER_SECOND))
  const maxWords = roundToFive(maxSeconds * (isRange ? WORDS_PER_SECOND : FAST_WORDS_PER_SECOND))
  const label =
    minSeconds === maxSeconds
      ? `around ${formatSeconds(minSeconds)}`
      : `${formatSeconds(minSeconds)} to ${formatSeconds(maxSeconds)}`
  return `approximately ${minWords}-${maxWords} words (${label})`
}
