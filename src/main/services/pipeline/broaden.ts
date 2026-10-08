import { isQueryBlocked } from '../agent/content-filters.ts'
import { visualStyleLine } from '../agent/style-guidance.ts'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'
import { hasFreeCandidate } from './allocate.ts'
import type { PipelineBeat, PipelineContext } from './context.ts'

/** Queries kept for a beat in the broader search. */
export const MAX_BROADER_QUERIES = 3

export const SUBMIT_BROADER_QUERIES_TOOL: NormalizedToolDefinition = {
  name: 'submit_broader_queries',
  description: 'Write broader Pexels queries for beats whose searches found nothing usable.',
  parameters: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            beatId: { type: 'string' },
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: '2 or 3 Pexels queries of 1 to 4 words, broader than the ones tried.'
            }
          },
          required: ['beatId', 'queries']
        }
      }
    },
    required: ['beats']
  }
}

export type BroaderQueriesPromptInput = {
  style: string
  visualConcept?: string
  avoidPeople: boolean
}

export function buildBroaderQueriesSystemPrompt(input: BroaderQueriesPromptInput): string {
  const visualConcept = input.visualConcept?.trim()
  const conceptLine = visualConcept ? `\nVisual direction for this video: ${visualConcept}` : ''
  const peopleLine = input.avoidPeople
    ? '\nThe user wants no people in the footage, so search for objects, places, and nature.'
    : ''

  return `Write new Pexels queries for the beats of a narrated video whose searches found nothing usable. The user message lists each beat with its narration, its visual prompt, and the queries already tried.

Rules:
1. For each beat, write 2 or 3 queries of 1 to 4 words, in English, for things a camera can film.
2. Go broader than the queries tried: drop adjectives, use a synonym, or name a related object, place, or mood that a stock library would have.
3. Pexels has no search operators, so do not use quotes, AND, OR, or negation.
4. Do not repeat a query that was tried.

Visual style: ${visualStyleLine(input.style)}${conceptLine}${peopleLine}

Call submit_broader_queries once, with every beat of the user message.`
}

export function describeBeatForBroadening(beat: PipelineBeat): string {
  return [
    `${beat.id}: ${JSON.stringify(beat.text)}`,
    `Visual prompt: ${beat.visualPrompt}`,
    `Tried: ${beat.tried.length > 0 ? beat.tried.join(', ') : 'nothing'}`
  ].join('\n')
}

export function buildBroaderQueriesUserContent(beats: PipelineBeat[]): string {
  return beats.map(describeBeatForBroadening).join('\n\n')
}

/**
 * Beats with nothing usable: they hold no asset, and their ranking is empty or has no candidate
 * they may still be given. A beat the cap left out has candidates to spare and is not one.
 * Beats already searched again are left out, so a beat is broadened once.
 */
export function beatsNeedingBroaderQueries(
  beats: PipelineBeat[],
  rankingByBeat: Record<string, string[]>,
  alreadyRetried: string[] = []
): PipelineBeat[] {
  const taken = new Set(beats.flatMap((beat) => beat.held))
  return beats.filter(
    (beat) =>
      beat.held.length === 0 &&
      !alreadyRetried.includes(beat.id) &&
      !hasFreeCandidate(
        { id: beat.id, existing: beat.held, excluded: beat.excluded },
        rankingByBeat[beat.id],
        taken
      )
  )
}

/** Reads the broader queries. A beat that was not asked about, and queries that repeat, are dropped. */
export function parseBroaderQueries(
  argumentsJson: string,
  asked: Set<string>,
  isBlocked: (query: string) => boolean = () => false
): Map<string, string[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch (err) {
    throw new Error(
      `Broader queries arguments were not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const items = (parsed as { beats?: unknown } | null)?.beats
  if (!Array.isArray(items)) throw new Error('Broader queries response missing "beats" array.')

  const result = new Map<string, string[]>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const { beatId, queries } = item as { beatId?: unknown; queries?: unknown }
    if (typeof beatId !== 'string' || !asked.has(beatId) || !Array.isArray(queries)) continue
    const kept: string[] = []
    for (const query of queries) {
      if (typeof query !== 'string') continue
      const text = query.trim().slice(0, 100)
      if (text.length < 2 || isBlocked(text)) continue
      if (!kept.some((other) => other.toLowerCase() === text.toLowerCase())) kept.push(text)
    }
    if (kept.length > 0) result.set(beatId, kept.slice(0, MAX_BROADER_QUERIES))
  }
  return result
}

/**
 * One request for all the beats that need broader queries. A beat the model gave no usable
 * query for stays out of the result. A request that fails (not a pause or cancel) is logged and
 * gives no queries at all: the beats are listed in the summary instead of failing the job.
 */
export async function broadenQueries(
  ctx: PipelineContext,
  beats: PipelineBeat[]
): Promise<Record<string, string[]>> {
  if (beats.length === 0) return {}
  const safety = { skipExplicit: ctx.settings.skipExplicit, avoidPeople: ctx.settings.avoidPeople }
  try {
    const queries = await ctx.callStructured({
      tool: SUBMIT_BROADER_QUERIES_TOOL,
      systemPrompt: buildBroaderQueriesSystemPrompt({
        style: ctx.settings.style,
        visualConcept: ctx.settings.visualConcept,
        avoidPeople: ctx.settings.avoidPeople
      }),
      userContent: buildBroaderQueriesUserContent(beats),
      parse: (argumentsJson) =>
        parseBroaderQueries(argumentsJson, new Set(beats.map((beat) => beat.id)), (query) =>
          isQueryBlocked(query, safety)
        ),
      label: 'Broader queries'
    })
    // A query the beat already tried would find the same results again.
    const result: Record<string, string[]> = {}
    for (const beat of beats) {
      const tried = new Set(beat.tried.map((query) => query.toLowerCase()))
      const fresh = (queries.get(beat.id) ?? []).filter((query) => !tried.has(query.toLowerCase()))
      if (fresh.length > 0) result[beat.id] = fresh
    }
    return result
  } catch (error) {
    if (ctx.signal.aborted) throw error
    ctx.log(
      'error',
      `Writing broader queries failed, so ${beats.length === 1 ? '1 beat stays' : `${beats.length} beats stay`} without footage: ${error instanceof Error ? error.message : String(error)}`
    )
    return {}
  }
}
