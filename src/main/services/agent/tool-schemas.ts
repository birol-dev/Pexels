import { z } from 'zod'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'

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
  assetIds: z.array(
    z.object({
      assetType: z.enum(['photo', 'video']),
      pexelsId: z.number().int().positive()
    })
  )
})

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
      logMessage: `Agent finished without downloading any assets for ${input.beats.length} visual beats. Try using a model with robust tool calling support (such as gpt-4o, claude-3.7-sonnet, gemini-3.8-flash, or gemini-2.5-flash).`,
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
