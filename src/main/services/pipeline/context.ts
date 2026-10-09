import type { SearchMode } from '../agent/search-mode.ts'
import { shapeOf, type Shape } from '../agent/tool-results.ts'
import type { BeatAssetType } from '../llm/beat-parse-tool.ts'
import type { StructuredRequest } from '../llm/structured-request.ts'
import { candidateKey, thumbnailUrlOf, type PexelsCandidate } from '../pexels/candidates.ts'
import type {
  PexelsPhotoSearchInput,
  PexelsPhotoSearchResult,
  PexelsVideoSearchInput,
  PexelsVideoSearchResult
} from '../pexels/pexels-types.ts'

/** What the steps need to know about a job. The runner fills it from the job's input and pin. */
export interface PipelineSettings {
  platform: string
  mix: 'videos only' | 'photos only' | 'videos + photos'
  searchMode: SearchMode
  style: string
  visualConcept?: string
  /** "Options per beat": the assets each beat is asked to have, before the share of the cap. */
  optionsPerBeat: number
  maxTotalDownloads: number
  skipExplicit: boolean
  avoidPeople: boolean
  requireApproval: boolean
  /**
   * The ranking step attaches a thumbnail of each candidate, up to a cap per beat. Off by
   * default: a job that has it off sends the same requests as one built without the feature.
   */
  rankWithThumbnails: boolean
}

/** A beat as the steps see it. The runner builds it from the live beat each time it is asked. */
export interface PipelineBeat {
  id: string
  text: string
  visualPrompt: string
  /** The queries the beat plan wrote, most specific first. Can be empty. */
  queries: string[]
  assetType: BeatAssetType
  /** Keys of the beat's assets that are not failed. */
  held: string[]
  /** Keys the beat must not get again: picks the user rejected and downloads that failed. */
  excluded: string[]
  /** Queries already sent to Pexels for this beat. */
  tried: string[]
}

/** What the ranking sees of a candidate. The full candidate stays in the runner's cache. */
export interface Candidate {
  key: string
  type: 'photo' | 'video'
  pexelsId: number
  about: string
  shape: Shape
  width: number
  height: number
  seconds?: number
  /** A small image of the candidate on images.pexels.com. Missing when it has none to show. */
  thumbnailUrl?: string
}

export function describeCandidate(candidate: PexelsCandidate): Candidate {
  return {
    key: candidateKey(candidate.type, candidate.pexelsId),
    type: candidate.type,
    pexelsId: candidate.pexelsId,
    about: candidate.about ?? '',
    shape: shapeOf(candidate.width, candidate.height),
    width: candidate.width,
    height: candidate.height,
    seconds: candidate.type === 'video' ? candidate.duration : undefined,
    thumbnailUrl: thumbnailUrlOf(candidate)
  }
}

export type PipelineStep = 'planned' | 'searched' | 'ranked' | 'allocated' | 'retried' | 'done'

/** Where the pipeline is. Saved after every step, and while a step goes on, so a resume picks up from it. */
export interface PipelineState {
  step: PipelineStep
  /** Beat id to the keys of the candidates that survived filtering, in the order they were found. */
  candidatesByBeat: Record<string, string[]>
  /** Beat id to the keys the model ranked for it, best first. An empty list says none fit. */
  rankingByBeat: Record<string, string[]>
  /** Beats the broader search ran for. The broader search runs once. */
  retriedBeats: string[]
  /** The queries of the broader search, by beat id. */
  broaderQueries: Record<string, string[]>
  /** Model requests the ranking and broader steps made. */
  modelCalls: number
}

export function initialPipelineState(): PipelineState {
  return {
    step: 'planned',
    candidatesByBeat: {},
    rankingByBeat: {},
    retriedBeats: [],
    broaderQueries: {},
    modelCalls: 0
  }
}

const STEPS: PipelineStep[] = ['planned', 'searched', 'ranked', 'allocated', 'retried', 'done']

function stringLists(value: unknown): Record<string, string[]> {
  const lists: Record<string, string[]> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return lists
  for (const [id, list] of Object.entries(value)) {
    if (Array.isArray(list))
      lists[id] = list.filter((item): item is string => typeof item === 'string')
  }
  return lists
}

/** The state as saved in agent-state.json, or undefined when it is missing or not a state. */
export function parsePipelineState(value: unknown): PipelineState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (typeof v.step !== 'string' || !STEPS.includes(v.step as PipelineStep)) return undefined
  return {
    step: v.step as PipelineStep,
    candidatesByBeat: stringLists(v.candidatesByBeat),
    rankingByBeat: stringLists(v.rankingByBeat),
    retriedBeats: Array.isArray(v.retriedBeats)
      ? v.retriedBeats.filter((id): id is string => typeof id === 'string')
      : [],
    broaderQueries: stringLists(v.broaderQueries),
    modelCalls:
      typeof v.modelCalls === 'number' && Number.isFinite(v.modelCalls) && v.modelCalls > 0
        ? Math.floor(v.modelCalls)
        : 0
  }
}

/** What 'select' did with a pick. */
export type SelectOutcome = 'selected' | 'refused'

/**
 * Everything the steps reach outside themselves through. The runner builds one from its own
 * seams; a test builds one from fakes.
 */
export interface PipelineContext {
  settings: PipelineSettings
  /** Aborts when the job is paused or cancelled. Every request gets it. */
  signal: AbortSignal
  /** The beats as they are now, with the assets they hold. */
  beats(): PipelineBeat[]
  searchPhotos(params: PexelsPhotoSearchInput): Promise<PexelsPhotoSearchResult>
  searchVideos(params: PexelsVideoSearchInput): Promise<PexelsVideoSearchResult>
  /** Keeps candidates for the job, so a pick can be looked up and checked against them. */
  cacheCandidates(candidates: PexelsCandidate[]): void
  candidate(key: string): PexelsCandidate | undefined
  /** Notes that a query is being sent for a beat, for the beat's search history. */
  noteQuery(beatId: string, query: string): void
  callStructured<T>(request: StructuredRequest<T>): Promise<T>
  /**
   * Records a pick on its beat, and starts its download unless the job waits for approval.
   * Refused when the beat cannot take it: the user rejected it, another beat holds it, or it
   * has no file that can be downloaded.
   */
  select(beatId: string, key: string): SelectOutcome
  /** Pauses the job for the user to review the picks that are waiting. */
  holdForApproval(): Promise<void>
  log(type: 'info' | 'error', message: string): void
  progress(step: string, percent: number): void
  /** Saves the state, and the picks made so far, so a resume starts from here. */
  saveState(state: PipelineState): Promise<void>
}
