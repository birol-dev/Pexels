export interface SummaryBeat {
  id: string
  text: string
  /** Assets the beat has: picked, waiting for approval, downloading or saved. Failed ones do not count. */
  assets: number
  /** Queries sent to Pexels for the beat. */
  tried: string[]
}

export interface SummaryInput {
  beats: SummaryBeat[]
  /** Requests to the model: the beat plan, the rankings and the broader queries. */
  modelCalls: number
  /** Tokens the job used, or 0 when the provider did not say. */
  totalTokens: number
}

const MAX_TEXT_CHARS = 60

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

function shortText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TEXT_CHARS ? `${flat.slice(0, MAX_TEXT_CHARS - 1).trimEnd()}…` : flat
}

/**
 * The line a pipeline run ends with, written by code from what the run did. It names the beats
 * left without footage and the queries tried for them, so the user can reword those beats.
 * Example: 15 beats: 14 with footage, 1 without (beat_9 "quantum entanglement", tried: quantum
 * particles, abstract light). 6 model calls, 14,200 tokens.
 */
export function summarizePipelineRun(input: SummaryInput): string {
  const without = input.beats.filter((beat) => beat.assets === 0)
  const withFootage = input.beats.length - without.length

  let coverage: string
  if (input.beats.length === 0) coverage = '0 beats'
  else if (without.length === 0)
    coverage = `${plural(input.beats.length, 'beat')}: all with footage`
  else {
    const names = without.map((beat) => {
      const tried = beat.tried.length > 0 ? `tried: ${beat.tried.join(', ')}` : 'no query was sent'
      return `${beat.id} "${shortText(beat.text)}", ${tried}`
    })
    coverage = `${plural(input.beats.length, 'beat')}: ${withFootage} with footage, ${without.length} without (${names.join('; ')})`
  }

  const usage =
    input.totalTokens > 0
      ? `${plural(input.modelCalls, 'model call')}, ${input.totalTokens.toLocaleString('en-US')} tokens`
      : plural(input.modelCalls, 'model call')
  return `${coverage}. ${usage}.`
}
