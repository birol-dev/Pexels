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
  perPage: z.number().int().min(1).max(80).default(15)
})

export const SearchPexelsVideosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(80).default(10)
})

export const SelectAssetsForDownloadArgsSchema = z.object({
  selections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        variantUrl: z.string().url(),
        reason: z.string().min(1).max(500)
      })
    )
    .default([]),
  rejections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        reason: z.string().min(1).max(500)
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
          description: 'Desired orientation.'
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        color: { type: 'string', description: 'Desired dominant color.' },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 15).' }
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
          description: 'Desired orientation.'
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 10).' }
      },
      required: ['beatId', 'query']
    }
  },
  {
    name: 'select_assets_for_download',
    description:
      'Select candidates to be downloaded or reject candidates with a reason after search results are visible.',
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
                description: 'The direct download URL from the search result variants.'
              },
              reason: {
                type: 'string',
                description: 'Brief explanation of why this asset is selected.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId', 'variantUrl', 'reason']
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
                description: 'Brief explanation of why this asset was rejected.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId', 'reason']
          }
        }
      },
      required: ['selections']
    }
  },
  {
    name: 'download_selected_assets',
    description: 'Queue previously selected assets to be downloaded.',
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

/** Beats with no usable assets (empty or all failed). */
export function getUnfulfilledBeats<T extends BeatAssetStatus>(beats: T[]): T[] {
  return beats.filter(
    (b) => !b.assets || b.assets.length === 0 || b.assets.every((a) => a.status === 'failed')
  )
}

export function countNonFailedAssets(beats: BeatAssetStatus[]): number {
  return beats.flatMap((b) => b.assets || []).filter((a) => a.status !== 'failed').length
}

export function countCompletedAssets(beats: BeatAssetStatus[]): number {
  return beats.flatMap((b) => b.assets || []).filter((a) => a.status === 'completed').length
}

export function hasPendingUnqueuedAssets(beats: BeatAssetStatus[]): boolean {
  return beats.some((b) => (b.assets || []).some((a) => a.status === 'pending'))
}

/** Loop-exit readiness: every beat has assets, or the download cap is saturated. */
export function areBeatsSatisfiedForLoop(
  beats: BeatAssetStatus[],
  maxTotalDownloads: number
): boolean {
  return getUnfulfilledBeats(beats).length === 0 || countNonFailedAssets(beats) >= maxTotalDownloads
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
  if (input.loopError && decision.status === 'failed') {
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
