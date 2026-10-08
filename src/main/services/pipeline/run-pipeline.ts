import type { SearchMode } from '../agent/search-mode.ts'
import { assetsNeededPerBeat } from '../agent/tool-schemas.ts'
import { allocateSlots } from './allocate.ts'
import { beatsNeedingBroaderQueries, broadenQueries } from './broaden.ts'
import {
  initialPipelineState,
  type PipelineBeat,
  type PipelineContext,
  type PipelineState
} from './context.ts'
import { RANK_BATCH_SIZE, rankBeats } from './rank.ts'
import { searchBeats } from './search.ts'
import { candidateKey } from '../pexels/candidates.ts'

// Where each step sits on the progress bar. Planning ends at 15 and downloads settle at 90.
const SEARCH_FROM = 30
const SEARCH_TO = 50
const RANK_TO = 70

/** A pick that is refused is not tried again for its beat, up to this many allocation rounds. */
const MAX_FILL_ROUNDS = 3

export interface PipelineJob {
  /** Where an earlier run got to. A job that has not started has none. */
  state?: PipelineState
}

/**
 * 'finished' when every step ran. 'held' when the run stopped to wait for the user's approval of
 * the picks; it goes on from there when the job is resumed.
 */
export type PipelineOutcome = 'finished' | 'held'

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : noun.endsWith('ch') ? 'es' : 's'}`

async function searchStage(
  ctx: PipelineContext,
  state: PipelineState,
  beats: PipelineBeat[],
  mode: SearchMode
): Promise<void> {
  // A resume skips the beats that were searched before the run stopped.
  const todo = beats.filter((beat) => state.candidatesByBeat[beat.id] === undefined)
  if (todo.length === 0) return

  ctx.log('info', `Searching Pexels for ${plural(todo.length, 'beat')} (${mode} mode).`)
  ctx.progress(`Searching Pexels (0 of ${todo.length})`, SEARCH_FROM)
  let done = 0
  await searchBeats(ctx, todo, mode, (beat, candidates) => {
    ctx.cacheCandidates(candidates)
    state.candidatesByBeat[beat.id] = candidates.map((c) => candidateKey(c.type, c.pexelsId))
    done++
    ctx.progress(
      `Searching Pexels (${done} of ${todo.length})`,
      Math.round(SEARCH_FROM + ((SEARCH_TO - SEARCH_FROM) * done) / todo.length)
    )
  })
}

async function rankStage(
  ctx: PipelineContext,
  state: PipelineState,
  beats: PipelineBeat[]
): Promise<void> {
  const todo = beats.filter((beat) => state.rankingByBeat[beat.id] === undefined)
  if (todo.length === 0) return

  const ranked = todo.filter((beat) => (state.candidatesByBeat[beat.id]?.length ?? 0) > 0)
  const batches = Math.ceil(ranked.length / RANK_BATCH_SIZE)
  ctx.log(
    'info',
    batches > 0
      ? `Ranking footage for ${plural(ranked.length, 'beat')} in ${plural(batches, 'batch')}.`
      : 'No beat has candidates to rank.'
  )
  let done = 0
  await rankBeats(ctx, todo, state.candidatesByBeat, (rankings, modelCalls) => {
    Object.assign(state.rankingByBeat, rankings)
    state.modelCalls += modelCalls
    done += modelCalls
    if (modelCalls > 0) {
      ctx.progress(
        `Ranking footage (batch ${done} of ${batches})`,
        Math.round(SEARCH_TO + ((RANK_TO - SEARCH_TO) * done) / batches)
      )
    }
  })
}

/** The picks the rankings can still make for the free slots, leaving out what was refused. */
function nextPicks(
  ctx: PipelineContext,
  state: PipelineState,
  refused: Map<string, string[]> = new Map()
): Array<{ beatId: string; key: string }> {
  const beats = ctx.beats()
  return allocateSlots({
    beats: beats.map((beat) => ({
      id: beat.id,
      existing: beat.held,
      excluded: [...beat.excluded, ...(refused.get(beat.id) ?? [])]
    })),
    rankingByBeat: state.rankingByBeat,
    perBeatTarget: assetsNeededPerBeat({
      beatCount: beats.length,
      optionsPerBeat: ctx.settings.optionsPerBeat,
      maxTotalDownloads: ctx.settings.maxTotalDownloads
    }),
    totalCap: ctx.settings.maxTotalDownloads,
    takenKeys: new Set(beats.flatMap((beat) => beat.held))
  })
}

/**
 * Whether a free slot has a ranked candidate waiting for it. A download that failed leaves one:
 * the beat is short, and the ranking has its next pick.
 */
export function hasPicksToMake(ctx: PipelineContext, state: PipelineState): boolean {
  return nextPicks(ctx, state).length > 0
}

/**
 * Allocates the free slots from the rankings and records each pick on its beat. A pick the beat
 * cannot take is set aside and the beat gets its next one. Returns how many picks were made.
 */
async function fill(ctx: PipelineContext, state: PipelineState): Promise<number> {
  const refused = new Map<string, string[]>()
  let selected = 0

  for (let round = 0; round < MAX_FILL_ROUNDS; round++) {
    const allocations = nextPicks(ctx, state, refused)
    if (allocations.length === 0) break

    let anyRefused = false
    for (const { beatId, key } of allocations) {
      if (ctx.select(beatId, key) === 'selected') {
        selected++
      } else {
        refused.set(beatId, [...(refused.get(beatId) ?? []), key])
        anyRefused = true
      }
    }
    if (!anyRefused) break
  }
  return selected
}

/** Fills the free slots, saves, and under approval mode stops for the user. True when it stopped. */
async function fillOrHold(ctx: PipelineContext, state: PipelineState): Promise<boolean> {
  ctx.progress('Selecting footage', RANK_TO)
  const selected = await fill(ctx, state)
  if (selected > 0) {
    ctx.log('info', `Picked ${plural(selected, 'asset')} from the rankings.`)
  }
  await ctx.saveState(state)
  if (selected > 0 && ctx.settings.requireApproval) {
    await ctx.holdForApproval()
    return true
  }
  return false
}

/**
 * Beats with nothing usable get one round of broader queries: one request for all of them, then
 * search, filter and rank for those beats alone. The round runs once per job. True when a beat
 * was searched again, so there may be footage to pick.
 */
async function retryStage(ctx: PipelineContext, state: PipelineState): Promise<boolean> {
  if (state.retriedBeats.length === 0) {
    const needy = beatsNeedingBroaderQueries(ctx.beats(), state.rankingByBeat)
    if (needy.length === 0) return false

    ctx.log(
      'info',
      `${plural(needy.length, 'beat')} found nothing usable (${needy.map((beat) => beat.id).join(', ')}). Writing broader queries.`
    )
    ctx.progress('Writing broader queries', RANK_TO)
    const queries = await broadenQueries(ctx, needy)
    state.modelCalls++
    state.broaderQueries = queries
    state.retriedBeats = Object.keys(queries)
    // These beats go through search and ranking again, as beats not yet searched.
    for (const id of state.retriedBeats) {
      delete state.candidatesByBeat[id]
      delete state.rankingByBeat[id]
    }
    await ctx.saveState(state)
  }

  if (state.retriedBeats.length === 0) return false
  const retried = ctx
    .beats()
    .filter((beat) => state.retriedBeats.includes(beat.id))
    // The broader queries are for whichever type has footage.
    .map((beat) => ({
      ...beat,
      queries: state.broaderQueries[beat.id] ?? [],
      assetType: 'either' as const
    }))
  await searchStage(ctx, state, retried, 'broad')
  await rankStage(ctx, state, retried)
  return true
}

/**
 * Runs the steps after the beat plan, from wherever `job.state` says the last run got to:
 * search and filter, rank, allocate and select, then one broader round for beats with nothing.
 * The state is saved after each step and as search and ranking go, so a resume repeats no
 * request that already answered. A pause or cancel throws from the request in flight or at the
 * next step.
 */
export async function runPipeline(
  ctx: PipelineContext,
  job: PipelineJob = {}
): Promise<PipelineOutcome> {
  const state = job.state ?? initialPipelineState()

  if (state.step === 'planned') {
    await searchStage(ctx, state, ctx.beats(), ctx.settings.searchMode)
    state.step = 'searched'
    await ctx.saveState(state)
  }
  ctx.signal.throwIfAborted()

  if (state.step === 'searched') {
    await rankStage(ctx, state, ctx.beats())
    state.step = 'ranked'
    await ctx.saveState(state)
  }
  ctx.signal.throwIfAborted()

  if (state.step === 'ranked') {
    state.step = 'allocated'
    if (await fillOrHold(ctx, state)) return 'held'
  } else if (state.step === 'allocated' || state.step === 'retried') {
    // Back from an approval: what the user rejected is replaced from the rankings.
    if (await fillOrHold(ctx, state)) return 'held'
  }
  ctx.signal.throwIfAborted()

  if (state.step === 'allocated') {
    const searchedAgain = await retryStage(ctx, state)
    state.step = 'retried'
    await ctx.saveState(state)
    if (searchedAgain && (await fillOrHold(ctx, state))) return 'held'
  }

  state.step = 'done'
  await ctx.saveState(state)
  return 'finished'
}
