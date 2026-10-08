import { EXPLICIT_QUERY_BLOCKED_MESSAGE, isQueryBlocked } from '../agent/content-filters.ts'
import type { SearchMode } from '../agent/search-mode.ts'
import {
  photoResultForModel,
  shapeForPlatform,
  videoResultForModel
} from '../agent/tool-results.ts'
import type { BeatAssetType } from '../llm/beat-parse-tool.ts'
import { photoCandidate, videoCandidate, type PexelsCandidate } from '../pexels/candidates.ts'
import type { PipelineBeat, PipelineContext, PipelineSettings } from './context.ts'
import { DEFAULT_FILTER_LIMITS, filterCandidates, type FilterRules } from './filter.ts'
import { createPool, firstFailure } from './pool.ts'

/** Searches that run at the same time. Pexels rate limits by hour, so this only paces the burst. */
export const SEARCH_POOL_SIZE = 4
export const RESULTS_PER_SEARCH = 15
/** Fewer candidates than this after filtering and the search goes on to its next query or type. */
export const MIN_CANDIDATES = 5
/** Focused mode sends the first query, and the second only when the first found too little. */
const FOCUSED_QUERY_LIMIT = 2

export function filterRulesFor(
  settings: PipelineSettings,
  beat: Pick<PipelineBeat, 'excluded'>
): FilterRules {
  return {
    shape: shapeForPlatform(settings.platform),
    minLongEdge: { ...DEFAULT_FILTER_LIMITS.minLongEdge },
    videoSeconds: { ...DEFAULT_FILTER_LIMITS.videoSeconds },
    avoidPeople: settings.avoidPeople,
    skipExplicit: settings.skipExplicit,
    rejectedKeys: new Set(beat.excluded)
  }
}

/**
 * The types to search for a beat, in order. The mix decides when it allows one type. When it
 * allows both, the beat's own type wins, and "either" searches videos first and photos after.
 */
export function typesToSearch(
  assetType: BeatAssetType,
  mix: PipelineSettings['mix']
): Array<'video' | 'photo'> {
  if (mix === 'videos only') return ['video']
  if (mix === 'photos only') return ['photo']
  return assetType === 'either' ? ['video', 'photo'] : [assetType]
}

/** The beat's queries, trimmed and without repeats. A beat with none is searched by its visual prompt. */
export function queriesFor(
  beat: Pick<PipelineBeat, 'queries' | 'visualPrompt' | 'text'>
): string[] {
  const seen = new Set<string>()
  const queries = beat.queries
    .map((query) => query.trim().slice(0, 100))
    .filter((query) => {
      const lower = query.toLowerCase()
      if (query.length < 2 || seen.has(lower)) return false
      seen.add(lower)
      return true
    })
  if (queries.length > 0) return queries
  return [(beat.visualPrompt.trim() || beat.text.trim()).slice(0, 100)]
}

async function searchOne(
  ctx: PipelineContext,
  pool: ReturnType<typeof createPool>,
  beat: PipelineBeat,
  type: 'video' | 'photo',
  query: string,
  counter: { searches: number }
): Promise<PexelsCandidate[]> {
  try {
    return await pool(async () => {
      counter.searches++
      ctx.noteQuery(beat.id, query)
      const orientation = shapeForPlatform(ctx.settings.platform)
      if (type === 'video') {
        const found = await ctx.searchVideos({ query, orientation, per_page: RESULTS_PER_SEARCH })
        return found.videos.map((video) => ({
          ...videoCandidate(video, query),
          about: videoResultForModel(video).about
        }))
      }
      const found = await ctx.searchPhotos({ query, orientation, per_page: RESULTS_PER_SEARCH })
      return found.photos.map((photo) => ({
        ...photoCandidate(photo, query),
        about: photoResultForModel(photo).about
      }))
    })
  } catch (error) {
    // A pause, a cancel or a quota pause stops the whole step. Any other failure costs one query.
    if (ctx.signal.aborted) throw error
    ctx.log(
      'error',
      `[${beat.id}] Search for "${query}" failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}

async function searchBeat(
  ctx: PipelineContext,
  pool: ReturnType<typeof createPool>,
  beat: PipelineBeat,
  mode: SearchMode
): Promise<PexelsCandidate[]> {
  const safety = { skipExplicit: ctx.settings.skipExplicit, avoidPeople: ctx.settings.avoidPeople }
  const queries = queriesFor(beat).filter((query) => {
    if (!isQueryBlocked(query, safety)) return true
    ctx.log('info', `[${beat.id}] Skipped the query "${query}": ${EXPLICIT_QUERY_BLOCKED_MESSAGE}`)
    return false
  })

  const rules = filterRulesFor(ctx.settings, beat)
  const found: PexelsCandidate[] = []
  const enough = (): boolean => filterCandidates(found, rules).length >= MIN_CANDIDATES
  const counter = { searches: 0 }

  const types = typesToSearch(beat.assetType, ctx.settings.mix)
  for (const [typeIndex, type] of types.entries()) {
    // The second type is only for a beat the first one could not fill.
    if (typeIndex > 0 && enough()) break
    if (mode === 'broad') {
      const lists = await Promise.all(
        queries.map((query) => searchOne(ctx, pool, beat, type, query, counter))
      )
      found.push(...lists.flat())
    } else {
      for (const [index, query] of queries.slice(0, FOCUSED_QUERY_LIMIT).entries()) {
        if (index > 0 && enough()) break
        found.push(...(await searchOne(ctx, pool, beat, type, query, counter)))
      }
    }
  }

  const candidates = filterCandidates(found, rules)
  const searches = `${counter.searches} search${counter.searches === 1 ? '' : 'es'}`
  ctx.log(
    'info',
    candidates.length > 0
      ? `[${beat.id}] ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} from ${searches}.`
      : `[${beat.id}] No usable candidates from ${searches}${queries.length > 0 ? ` (${queries.join(', ')})` : ''}.`
  )
  return candidates
}

/**
 * Searches for every beat and filters what comes back. Beats go at the same time, and no more
 * than SEARCH_POOL_SIZE searches are out at once. `onBeat` hears of each beat as it finishes, so
 * a pause part-way keeps the beats that are done. Returns the kept candidates by beat id.
 *
 * Focused mode sends a beat's first query, and its second when fewer than MIN_CANDIDATES
 * survive. Broad mode sends all of a beat's queries at once. Either way, a beat that accepts
 * both types goes on to photos only when videos left it short.
 */
export async function searchBeats(
  ctx: PipelineContext,
  beats: PipelineBeat[],
  mode: SearchMode,
  onBeat?: (beat: PipelineBeat, candidates: PexelsCandidate[]) => void
): Promise<Map<string, PexelsCandidate[]>> {
  const pool = createPool(SEARCH_POOL_SIZE, ctx.signal)
  const found = new Map<string, PexelsCandidate[]>()

  const settled = await Promise.allSettled(
    beats.map(async (beat) => {
      const candidates = await searchBeat(ctx, pool, beat, mode)
      found.set(beat.id, candidates)
      onBeat?.(beat, candidates)
    })
  )
  const failure = firstFailure(settled)
  if (failure) throw failure.reason
  return found
}
