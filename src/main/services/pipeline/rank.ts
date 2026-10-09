import { visualStyleLine } from '../agent/style-guidance.ts'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'
import type { StructuredRequest } from '../llm/structured-request.ts'
import {
  describeCandidate,
  type Candidate,
  type PipelineBeat,
  type PipelineContext
} from './context.ts'
import { createPool, firstFailure } from './pool.ts'

/** Beats per ranking request. Small enough to keep each prompt focused. */
export const RANK_BATCH_SIZE = 5
/** Ranking requests in flight at once. The provider's rate limit paces them further. */
export const RANK_PARALLEL = 4
export const MAX_RANKED_PER_BEAT = 5
/**
 * Thumbnails attached for one beat when the job ranks with thumbnails: its first candidates that
 * have one. The rest are still listed and judged by their description. A batch of RANK_BATCH_SIZE
 * beats carries at most RANK_BATCH_SIZE times this many images.
 */
export const RANK_THUMBNAILS_PER_BEAT = 8

export const SUBMIT_RANKINGS_TOOL: NormalizedToolDefinition = {
  name: 'submit_rankings',
  description:
    'For each beat, list the candidates that fit, best first. Leave a beat empty if none fit.',
  parameters: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            beatId: { type: 'string' },
            ranked: {
              type: 'array',
              items: { type: 'string' },
              description: `Candidate keys, best first, at most ${MAX_RANKED_PER_BEAT}.`
            }
          },
          required: ['beatId', 'ranked']
        }
      }
    },
    required: ['beats']
  }
}

export type RankingPromptInput = {
  style: string
  /** The one-paragraph visual direction the idea step wrote, when there is one. */
  visualConcept?: string
  avoidPeople: boolean
  /** The user message comes with thumbnails of some candidates, so the model can look at them. */
  thumbnails?: boolean
}

/** Rule 1 when the model cannot look at the footage, as it always was. */
const RULE_DESCRIPTIONS_ONLY =
  '1. You cannot see the footage. Judge each candidate by its description, which is the alt text or the page slug Pexels gives it.'

/** Rule 1 when thumbnails come with the message. */
const RULE_WITH_THUMBNAILS =
  '1. Small thumbnails of some candidates come with the user message, which lists them in order by candidate key. Judge each candidate by its description, which is the alt text or the page slug Pexels gives it, and by what its thumbnail shows. A thumbnail is a still of the footage; for a video it is the preview image. Judge a candidate whose thumbnail is missing by its description alone.'

export function buildRankingSystemPrompt(input: RankingPromptInput): string {
  const visualConcept = input.visualConcept?.trim()
  const conceptLine = visualConcept ? `\nVisual direction for this video: ${visualConcept}` : ''
  const peopleLine = input.avoidPeople
    ? '\nThe user wants no people in the footage, so prefer objects, places, and nature over faces and crowds.'
    : ''

  return `Choose stock footage for the beats of a narrated video. The user message lists each beat with its narration, its visual prompt, and the Pexels candidates found for it. Each candidate has a key, a description, its shape, and for a video its length in seconds.

Rules:
${input.thumbnails ? RULE_WITH_THUMBNAILS : RULE_DESCRIPTIONS_ONLY}
2. For each beat, list the keys of the candidates that fit it, best first, at most ${MAX_RANKED_PER_BEAT}. Prefer candidates that show the beat's subject and action. Candidates are listed in Pexels' own relevance order, so when several look equally good, prefer the earlier ones.
3. Leave a beat's list empty when none of its candidates fit. Do not list a poor match to fill the list.
4. Use only the keys listed under that beat.
5. Prefer variety within the batch: when two beats could use similar clips, give them different ones.

Visual style: ${visualStyleLine(input.style)}${conceptLine}
Rank the candidates that fit this look first.${peopleLine}

Call submit_rankings once, with every beat of the user message.`
}

/** One beat as the ranking sees it. */
export function describeBeatForRanking(beat: PipelineBeat, candidates: Candidate[]): string {
  const lines = candidates.map((candidate) => {
    const parts = [candidate.about || 'no description', candidate.shape]
    if (candidate.seconds) parts.push(`${Math.round(candidate.seconds)}s`)
    return `- ${candidate.key}: ${parts.join(', ')}`
  })
  return [
    `${beat.id}: ${JSON.stringify(beat.text)}`,
    `Visual prompt: ${beat.visualPrompt}`,
    'Candidates:',
    ...lines
  ].join('\n')
}

type RankingEntry = { beat: PipelineBeat; candidates: Candidate[] }

/** A thumbnail attached to a ranking request, and the candidate it shows. */
export interface RankingThumbnail {
  key: string
  url: string
}

/**
 * The thumbnails to attach for a batch: for each beat in order, the first RANK_THUMBNAILS_PER_BEAT
 * of its candidates that have one, in the order the candidates are listed.
 */
export function pickRankingThumbnails(entries: RankingEntry[]): RankingThumbnail[] {
  return entries.flatMap((entry) =>
    entry.candidates
      .flatMap((candidate) =>
        candidate.thumbnailUrl ? [{ key: candidate.key, url: candidate.thumbnailUrl }] : []
      )
      .slice(0, RANK_THUMBNAILS_PER_BEAT)
  )
}

/**
 * The user message of a ranking request. With thumbnails it ends with the order the images are
 * attached in, by candidate key; without, it is the beats and nothing else.
 */
export function buildRankingUserContent(
  entries: RankingEntry[],
  thumbnails: RankingThumbnail[] = []
): string {
  const beats = entries
    .map((entry) => describeBeatForRanking(entry.beat, entry.candidates))
    .join('\n\n')
  if (thumbnails.length === 0) return beats
  return [
    beats,
    '',
    'Thumbnails are attached to this message in this order, and a candidate not listed has none:',
    ...thumbnails.map((thumbnail, index) => `Thumbnail ${index + 1} = ${thumbnail.key}`)
  ].join('\n')
}

/**
 * Reads the model's rankings. A key the beat was not offered is dropped, repeats are dropped, and
 * each list is cut to MAX_RANKED_PER_BEAT. A beat the answer leaves out is not in the result, and
 * neither is one whose keys were all dropped: its id goes into `unrecognised` instead, because
 * keys the model got wrong say nothing about whether a candidate fits. An empty list stays empty.
 */
export function parseRankings(
  argumentsJson: string,
  offered: Map<string, Set<string>>,
  unrecognised: Set<string> = new Set()
): Map<string, string[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch (err) {
    throw new Error(
      `Ranking arguments were not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const items = (parsed as { beats?: unknown } | null)?.beats
  if (!Array.isArray(items)) throw new Error('Ranking response missing "beats" array.')

  const rankings = new Map<string, string[]>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const { beatId, ranked } = item as { beatId?: unknown; ranked?: unknown }
    if (typeof beatId !== 'string') continue
    const allowed = offered.get(beatId)
    if (!allowed) continue
    const keys = Array.isArray(ranked) ? ranked : []
    const kept: string[] = []
    for (const key of keys) {
      if (typeof key === 'string' && allowed.has(key) && !kept.includes(key)) kept.push(key)
    }
    if (keys.length > 0 && kept.length === 0) {
      unrecognised.add(beatId)
      continue
    }
    rankings.set(beatId, kept.slice(0, MAX_RANKED_PER_BEAT))
  }
  return rankings
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * Ranks the candidates of each beat. Beats with no candidate need no model: their ranking is empty.
 * The others go to the model RANK_BATCH_SIZE at a time, the batches together. `onBatch` gets the
 * rankings of each batch as it lands, with the number of model requests it cost, so a pause
 * part-way keeps the batches that are done.
 *
 * A batch the model could not answer (no tool call, bad arguments, a failed request) falls back
 * to Pexels' own order for its beats, and so does a beat the answer left out or gave only keys it
 * was not offered. An empty list the model wrote on purpose stays empty. A pause or cancel stops the step instead.
 */
export async function rankBeats(
  ctx: PipelineContext,
  beats: PipelineBeat[],
  candidatesByBeat: Record<string, string[]>,
  onBatch: (rankings: Record<string, string[]>, modelCalls: number) => void
): Promise<void> {
  const withCandidates: Array<{ beat: PipelineBeat; candidates: Candidate[] }> = []
  const empty: Record<string, string[]> = {}
  for (const beat of beats) {
    const candidates = (candidatesByBeat[beat.id] ?? []).flatMap((key) => {
      const found = ctx.candidate(key)
      return found ? [describeCandidate(found)] : []
    })
    if (candidates.length === 0) empty[beat.id] = []
    else withCandidates.push({ beat, candidates })
  }
  if (Object.keys(empty).length > 0) onBatch(empty, 0)

  const batches = chunk(withCandidates, RANK_BATCH_SIZE)
  const promptFor = (thumbnails: boolean): string =>
    buildRankingSystemPrompt({
      style: ctx.settings.style,
      visualConcept: ctx.settings.visualConcept,
      avoidPeople: ctx.settings.avoidPeople,
      thumbnails
    })
  const pool = createPool(RANK_PARALLEL, ctx.signal)

  const settled = await Promise.allSettled(
    batches.map((entries, index) =>
      pool(async () => {
        const offered = new Map(
          entries.map((entry) => [entry.beat.id, new Set(entry.candidates.map((c) => c.key))])
        )
        const unrecognised = new Set<string>()
        // A job with thumbnails off, or a batch none of whose candidates has one, sends exactly
        // the request a job built without thumbnails sends: no images, and the original texts.
        const thumbnails = ctx.settings.rankWithThumbnails ? pickRankingThumbnails(entries) : []
        const request: StructuredRequest<Map<string, string[]>> = {
          tool: SUBMIT_RANKINGS_TOOL,
          systemPrompt: promptFor(thumbnails.length > 0),
          userContent: buildRankingUserContent(entries, thumbnails),
          ...(thumbnails.length > 0 ? { images: thumbnails.map(({ url }) => ({ url })) } : {}),
          parse: (argumentsJson) => parseRankings(argumentsJson, offered, unrecognised),
          label: `Ranking batch ${index + 1} of ${batches.length}`
        }

        let answer: Map<string, string[]> | undefined
        try {
          answer = await ctx.callStructured(request)
        } catch (error) {
          if (ctx.signal.aborted) throw error
          ctx.log(
            'error',
            `Ranking batch ${index + 1} of ${batches.length} failed, so its beats keep the order Pexels gave: ${error instanceof Error ? error.message : String(error)}`
          )
        }

        const rankings: Record<string, string[]> = {}
        for (const entry of entries) {
          const ranked = answer?.get(entry.beat.id)
          if (ranked) {
            rankings[entry.beat.id] = ranked
            continue
          }
          if (answer)
            ctx.log(
              'info',
              unrecognised.has(entry.beat.id)
                ? `[${entry.beat.id}] The ranking's keys for this beat were not recognised. It keeps the order Pexels gave.`
                : `[${entry.beat.id}] The ranking left this beat out. It keeps the order Pexels gave.`
            )
          rankings[entry.beat.id] = entry.candidates.slice(0, MAX_RANKED_PER_BEAT).map((c) => c.key)
        }
        onBatch(rankings, 1)
      })
    )
  )
  const failure = firstFailure(settled)
  if (failure) throw failure.reason
}
