import { z } from 'zod'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'
import { ApiError } from '../http/api-errors.ts'

export const SearchPexelsPhotosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  color: z.string().optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(30).default(15)
})

export const SearchPexelsVideosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(30).default(10)
})

export const SelectAssetsForDownloadArgsSchema = z.object({
  selections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        variantUrl: z.string().url().optional(),
        reason: z.string().max(500).optional()
      })
    )
    .default([]),
  rejections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        reason: z.string().max(500).optional()
      })
    )
    .default([])
})

export const DownloadSelectedAssetsArgsSchema = z.object({
  assetIds: z
    .array(
      z.object({
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive()
      })
    )
    .default([])
})

export type SearchPexelsPhotosArgs = z.infer<typeof SearchPexelsPhotosArgsSchema>
export type SearchPexelsVideosArgs = z.infer<typeof SearchPexelsVideosArgsSchema>
export type SelectAssetsForDownloadArgs = z.infer<typeof SelectAssetsForDownloadArgsSchema>
export type DownloadSelectedAssetsArgs = z.infer<typeof DownloadSelectedAssetsArgsSchema>

export const AGENT_TOOLS: NormalizedToolDefinition[] = [
  {
    name: 'search_pexels_photos',
    description: 'Search for photos on Pexels matching a query for a script beat.',
    parameters: {
      type: 'object',
      properties: {
        beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
        query: { type: 'string', description: 'The search query keyword.' },
        orientation: {
          type: 'string',
          enum: ['landscape', 'portrait', 'square'],
          description: "Defaults to the platform's shape. Set it only to search a different one."
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        color: { type: 'string', description: 'Desired dominant color.' },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 15, at most 30).' }
      },
      required: ['beatId', 'query']
    }
  },
  {
    name: 'search_pexels_videos',
    description: 'Search for videos on Pexels matching a query for a script beat.',
    parameters: {
      type: 'object',
      properties: {
        beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
        query: { type: 'string', description: 'The search query keyword.' },
        orientation: {
          type: 'string',
          enum: ['landscape', 'portrait', 'square'],
          description: "Defaults to the platform's shape. Set it only to search a different one."
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 10, at most 30).' }
      },
      required: ['beatId', 'query']
    }
  },
  {
    name: 'select_assets_for_download',
    description:
      'Select the best search results for beats. Selecting starts the download. You may also list results you ruled out as rejections.',
    parameters: {
      type: 'object',
      properties: {
        selections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              beatId: { type: 'string', description: 'The ID of the beat.' },
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number', description: 'Pexels asset ID.' },
              variantUrl: {
                type: 'string',
                description: 'Optional. Leave it out and the app picks the best file.'
              },
              reason: {
                type: 'string',
                description: 'Optional. A few words on why this asset fits.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId']
          }
        },
        rejections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              beatId: { type: 'string', description: 'The ID of the beat.' },
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number' },
              reason: {
                type: 'string',
                description: 'Optional. 2 to 4 words, such as off topic or wrong shape.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId']
          }
        }
      },
      required: ['selections']
    }
  },
  {
    name: 'download_selected_assets',
    description:
      'Optional. Selecting an asset already starts its download. Use this only to check download status.',
    parameters: {
      type: 'object',
      properties: {
        assetIds: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number' }
            },
            required: ['assetType', 'pexelsId']
          }
        }
      },
      required: ['assetIds']
    }
  }
]

/** True when every beat has >=1 asset and all of those assets completed. */
export function areAllBeatsDownloaded(
  beats: Array<{ status: string; assets?: Array<{ status: string }> }>
): boolean {
  return (
    beats.length > 0 &&
    beats.every(
      (b) =>
        b.status === 'completed' &&
        (b.assets || []).length > 0 &&
        (b.assets || []).every((a) => a.status === 'completed')
    )
  )
}

export type BeatAssetStatus = { status: string; assets?: Array<{ status: string }> }

/**
 * Usable assets each beat is asked to have. "Options per beat" is a target, but a beat is not
 * asked for more than an even share of the download cap, and always for at least one.
 */
export function assetsNeededPerBeat(input: {
  beatCount: number
  optionsPerBeat: number
  maxTotalDownloads: number
}): number {
  const share =
    input.beatCount > 0
      ? Math.floor(input.maxTotalDownloads / input.beatCount)
      : input.optionsPerBeat
  return Math.max(1, Math.min(input.optionsPerBeat, share))
}

/** Beats with fewer usable assets (not failed) than `needed`: by default, beats with none. */
export function getUnfulfilledBeats<T extends BeatAssetStatus>(beats: T[], needed = 1): T[] {
  return beats.filter((b) => (b.assets || []).filter((a) => a.status !== 'failed').length < needed)
}

export function countNonFailedAssets(beats: BeatAssetStatus[]): number {
  return beats.flatMap((b) => b.assets || []).filter((a) => a.status !== 'failed').length
}

export function countCompletedAssets(beats: BeatAssetStatus[]): number {
  return beats.flatMap((b) => b.assets || []).filter((a) => a.status === 'completed').length
}

/** Assets that count against the download cap: finished, or on their way. */
export function countQueuedOrCompleted(beats: BeatAssetStatus[]): number {
  return beats
    .flatMap((b) => b.assets || [])
    .filter((a) => a.status === 'completed' || a.status === 'downloading').length
}

/** Assets selected but not yet queued, which is what the user reviews under approval mode. */
export function countPendingAssets(beats: BeatAssetStatus[]): number {
  return beats.flatMap((b) => b.assets || []).filter((a) => a.status === 'pending').length
}

export function hasPendingUnqueuedAssets(beats: BeatAssetStatus[]): boolean {
  return beats.some((b) => (b.assets || []).some((a) => a.status === 'pending'))
}

/**
 * Loop-exit readiness: every beat has the options it is asked for (at least one asset), or the
 * download cap is saturated. `optionsPerBeat` is the job's "options per beat" target.
 */
export function areBeatsSatisfiedForLoop(
  beats: BeatAssetStatus[],
  maxTotalDownloads: number,
  optionsPerBeat = 1
): boolean {
  const needed = assetsNeededPerBeat({
    beatCount: beats.length,
    optionsPerBeat,
    maxTotalDownloads
  })
  return (
    getUnfulfilledBeats(beats, needed).length === 0 ||
    countNonFailedAssets(beats) >= maxTotalDownloads
  )
}

export type RunFinalizeDecision = {
  status: 'completed' | 'failed'
  reason: string
  progressLabel: string
  logMessage: string
  logType: 'info' | 'error'
}

/**
 * Decide terminal status after the agent loop + download settle.
 * Incomplete beats are a failure unless the download cap was hit (partial pack by design).
 */
export function decideRunFinalize(input: {
  beats: BeatAssetStatus[]
  hitIterationLimit: boolean
  maxTotalDownloads: number
  maxIterations: number
  /** Error that aborted the agent loop (LLM timeout, auth failure, ...), if any. */
  loopError?: string
}): RunFinalizeDecision {
  const decision = decideRunFinalizeFromBeats(input)
  // A run that broke before it had any beats (a missing key, a failed beat split) did no work,
  // so it is a failure whatever the beat check says about an empty list.
  if (input.loopError && (decision.status === 'failed' || input.beats.length === 0)) {
    return {
      status: 'failed',
      reason: 'agent_error',
      progressLabel: 'Failed — agent error',
      logMessage: `Agent stopped because of an error: ${input.loopError}`,
      logType: 'error'
    }
  }
  return decision
}

/**
 * What to do with an error thrown out of the agent loop. Pause/cancel abort the
 * in-flight request on purpose, so those are not errors. Returns the message to
 * record, or null when the error should be ignored.
 */
export function loopErrorToRecord(status: string, error: unknown): string | null {
  if (status !== 'running') return null
  return error instanceof Error ? error.message : String(error)
}

/** Iterations left in the job-wide budget (persisted across pause/resume). */
export function remainingIterations(maxIterations: number, iterationsUsed: number): number {
  return Math.max(0, maxIterations - Math.max(0, iterationsUsed))
}

/** Reason stored on a beat when the user rejects a pending asset in the approval UI. */
export const USER_REJECTION_REASON = 'Rejected by user'

/** Reason stored when the model rejects an asset without saying why. */
export const DEFAULT_REJECTION_REASON = 'Not chosen'

/**
 * True when the user (not the model) rejected this asset for this beat. A user
 * rejection is final: the model may not re-select or download it, even though
 * the failed asset record is still on the beat.
 */
export function isAssetRejectedByUser(
  beat: { rejectedAssets?: Array<{ type: string; pexelsId: number; reason: string }> },
  type: string,
  pexelsId: number
): boolean {
  return (beat.rejectedAssets || []).some(
    (r) => r.type === type && r.pexelsId === pexelsId && r.reason === USER_REJECTION_REASON
  )
}

/** The beat, other than `beatId`, that already holds a usable copy of this asset. */
export function beatUsingAsset<
  T extends { id: string; assets?: Array<{ id: string; status: string }> }
>(beats: T[], beatId: string, recordId: string): T | undefined {
  return beats.find(
    (b) =>
      b.id !== beatId && (b.assets || []).some((a) => a.id === recordId && a.status !== 'failed')
  )
}

/**
 * Older runs could give one asset record id to several beats, which left a copy stuck
 * in "downloading". Keeps the copy that has a file (else the first) and fails the rest.
 */
export function releaseDuplicateAssetRecords(
  beats: Array<{
    id: string
    assets: Array<{ id: string; status: string; filePath?: string; error?: string }>
  }>
): Array<{ recordId: string; keptIn: string; releasedFrom: string }> {
  const released: Array<{ recordId: string; keptIn: string; releasedFrom: string }> = []
  const holders = new Map<
    string,
    Array<{ beatId: string; asset: (typeof beats)[number]['assets'][number] }>
  >()
  for (const beat of beats) {
    for (const asset of beat.assets) {
      if (asset.status === 'failed') continue
      holders.set(asset.id, [...(holders.get(asset.id) || []), { beatId: beat.id, asset }])
    }
  }
  for (const [recordId, copies] of holders) {
    if (copies.length < 2) continue
    const kept = copies.find((c) => c.asset.status === 'completed' && c.asset.filePath) || copies[0]
    for (const copy of copies) {
      if (copy === kept) continue
      copy.asset.status = 'failed'
      copy.asset.error = `Duplicate of the asset used for ${kept.beatId}`
      released.push({ recordId, keptIn: kept.beatId, releasedFrom: copy.beatId })
    }
  }
  return released
}

/**
 * Why a new selection for `beatId` must be refused, or null when it is allowed.
 * Besides the per-beat and total caps, a beat that already has an asset may not
 * take the last slots of the total budget while other beats still have none —
 * otherwise a greedy model starves the later beats of the script.
 */
export function selectionBudgetViolation(input: {
  beats: Array<BeatAssetStatus & { id: string }>
  beatId: string
  maxAssetsPerBeat: number
  maxTotalDownloads: number
}): string | null {
  const beat = input.beats.find((b) => b.id === input.beatId)
  if (!beat) return null

  const activeInBeat = (beat.assets || []).filter((a) => a.status !== 'failed').length
  if (activeInBeat >= input.maxAssetsPerBeat) {
    return `Beat cap of ${input.maxAssetsPerBeat} assets reached.`
  }

  const selected = countNonFailedAssets(input.beats)
  if (selected >= input.maxTotalDownloads) {
    return `Total download cap of ${input.maxTotalDownloads} assets reached.`
  }

  if (activeInBeat > 0) {
    const beatsWithoutAssets = getUnfulfilledBeats(input.beats).filter(
      (b) => b.id !== beat.id
    ).length
    if (input.maxTotalDownloads - selected <= beatsWithoutAssets) {
      return `Remaining download budget is reserved so every beat gets at least one asset (${beatsWithoutAssets} other beat(s) still have none).`
    }
  }

  return null
}

export type ToolFailure = {
  /** True when pause/cancel aborted the call on purpose — not a real failure. */
  interrupted: boolean
  message: string
  /** Payload returned to the model as the tool result. */
  result: Record<string, unknown>
}

/**
 * Turns an error thrown while executing a tool into a log message and a tool
 * result. Pause/cancel abort in-flight requests on purpose; recording that as a
 * permanent failure would teach the model on resume that the call is hopeless.
 */
export function describeToolFailure(status: string, error: unknown): ToolFailure {
  if (status !== 'running') {
    return {
      interrupted: true,
      message: `Tool call interrupted because the run was ${status}.`,
      result: {
        interrupted: true,
        note: `This call was interrupted because the run was ${status}. Repeat it if the result is still needed.`
      }
    }
  }

  const message =
    error instanceof ApiError
      ? `${error.message}${error.isRetryable ? ' (retryable)' : ''}`
      : error instanceof Error
        ? error.message
        : String(error)
  return {
    interrupted: false,
    message,
    result: { error: message, retryable: error instanceof ApiError ? error.isRetryable : false }
  }
}

/**
 * What the run log keeps of a tool result. The full result stays in the conversation
 * (agent-state.json). Selection, download and error results are small and pass through.
 */
export function summarizeToolResultForLog(toolName: string, result: unknown): unknown {
  if (toolName !== 'search_pexels_photos' && toolName !== 'search_pexels_videos') return result
  const found = result as {
    total_results?: number
    filtered?: number
    results?: Array<{ pexelsId?: number }>
  } | null
  if (!found || !Array.isArray(found.results)) return result
  return {
    total_results: found.total_results,
    returned: found.results.length,
    ...(found.filtered ? { filtered: found.filtered } : {}),
    ids: found.results.map((item) => item.pexelsId)
  }
}

/**
 * Status a beat should return to when its search was interrupted. Searching is
 * transient, so derive the status from what the beat actually holds.
 */
export function statusAfterInterruptedSearch(beat: {
  assets?: Array<{ status: string }>
}): 'pending' | 'selecting' | 'downloading' | 'completed' {
  const usable = (beat.assets || []).filter((a) => a.status !== 'failed')
  if (usable.length === 0) return 'pending'
  if (usable.every((a) => a.status === 'completed')) return 'completed'
  if (usable.some((a) => a.status === 'downloading')) return 'downloading'
  return 'selecting'
}

/**
 * Status a beat shows while it is searched. A beat that already holds a usable asset keeps the
 * status that asset gives it: nothing sets it back once the search is over, so "searching" would
 * stay on a beat that has its footage.
 */
export function statusDuringSearch(beat: {
  assets?: Array<{ status: string }>
}): 'searching' | 'selecting' | 'downloading' | 'completed' {
  const held = statusAfterInterruptedSearch(beat)
  return held === 'pending' ? 'searching' : held
}

function decideRunFinalizeFromBeats(input: {
  beats: BeatAssetStatus[]
  hitIterationLimit: boolean
  maxTotalDownloads: number
  maxIterations: number
}): RunFinalizeDecision {
  const unfinished = input.beats
    .flatMap((b) => b.assets || [])
    .filter((a) => a.status === 'pending' || a.status === 'downloading')
  if (unfinished.length > 0) {
    return {
      status: 'failed',
      reason: 'unfinished_downloads',
      progressLabel: 'Failed — unfinished downloads',
      logMessage: `Agent finished with ${unfinished.length} unfinished download(s); marking job failed.`,
      logType: 'error'
    }
  }

  const completedCount = countCompletedAssets(input.beats)
  if (completedCount === 0 && input.beats.length > 0) {
    return {
      status: 'failed',
      reason: 'zero_downloads',
      progressLabel: 'Failed — 0 assets downloaded',
      logMessage: `Agent finished without downloading any assets for ${input.beats.length} visual beats. Try a model with reliable tool calling support.`,
      logType: 'error'
    }
  }

  const hasIncompleteBeats =
    input.beats.length > 0 &&
    input.beats.some((b) => !b.assets || !b.assets.some((a) => a.status === 'completed'))
  const atDownloadCap = completedCount >= input.maxTotalDownloads

  if (hasIncompleteBeats && (input.hitIterationLimit || !atDownloadCap)) {
    const reason = input.hitIterationLimit ? 'iteration_limit' : 'incomplete_beats'
    const progressLabel = input.hitIterationLimit
      ? 'Failed — iteration limit'
      : 'Failed — incomplete beats'
    const logMessage = input.hitIterationLimit
      ? `Agent stopped after reaching the maximum iteration limit (${input.maxIterations}) with incomplete beats.`
      : `Agent stopped with incomplete beats (${completedCount} downloads, cap ${input.maxTotalDownloads}).`
    return {
      status: 'failed',
      reason,
      progressLabel,
      logMessage,
      logType: 'error'
    }
  }

  const logMessage =
    hasIncompleteBeats && atDownloadCap
      ? `Download cap (${input.maxTotalDownloads}) reached with ${completedCount} completed download(s); finishing with partial beat coverage.`
      : input.hitIterationLimit
        ? `Agent reached iteration limit (${input.maxIterations}) but all beats have completed downloads.`
        : 'Agent execution completed successfully!'

  return {
    status: 'completed',
    reason: hasIncompleteBeats ? 'partial_at_cap' : 'success',
    progressLabel: 'Finished',
    logMessage,
    logType: 'info'
  }
}
