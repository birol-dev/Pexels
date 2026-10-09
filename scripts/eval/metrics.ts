import type { AssetRecord, StartJobInput } from '../../src/main/services/agent/agent-runner.ts'

/**
 * The numbers of the evaluation's summary table, computed from a job's manifest.
 * Every function here is pure, so a hand-built list of beats is enough to test it.
 */

/** The parts of a manifest asset record the metrics read. */
export type MetricAsset = Pick<
  AssetRecord,
  'id' | 'type' | 'width' | 'height' | 'duration' | 'status'
>

/** The parts of a manifest beat the metrics read. A runner `VisualBeat` fits. */
export interface MetricBeat {
  id: string
  text: string
  assets: MetricAsset[]
}

export type Platform = StartJobInput['platform']

export interface Share {
  /** How many items passed. */
  count: number
  /** How many items were looked at. */
  total: number
  /** `count / total`, or null when there was nothing to look at. */
  ratio: number | null
}

/** What the LLM traffic of one job added up to. */
export interface LlmCost {
  /** HTTP requests sent to the provider, including rejected and retried ones. */
  llmCalls: number
  /** Input tokens, cached ones included. */
  inputTokens: number
  /** The part of `inputTokens` the provider served from its prompt cache. */
  cachedInputTokens: number
  /** Output tokens, reasoning included. */
  outputTokens: number
}

export interface EvalMetrics {
  scriptFidelity: boolean
  coverage: Share
  duplicates: { count: number; assetIds: string[] }
  orientationMatch: Share
  resolution: Share
  clipLength: Share
  cost: LlmCost
  seconds: number
}

export const MIN_VIDEO_LONG_EDGE = 1920
/** The large2x variant the app downloads for landscape photos is 1,880 pixels wide. */
export const MIN_PHOTO_LONG_EDGE = 1880
export const MIN_CLIP_SECONDS = 3
export const MAX_CLIP_SECONDS = 30

function share(count: number, total: number): Share {
  return { count, total, ratio: total > 0 ? count / total : null }
}

function withoutWhitespace(text: string): string {
  return text.replace(/\s+/gu, '')
}

function completedAssets(beats: MetricBeat[]): MetricAsset[] {
  return beats.flatMap((beat) => beat.assets).filter((asset) => asset.status === 'completed')
}

/**
 * Script fidelity: the beats' text, joined in order, is the script once whitespace is
 * ignored. A job without beats has reproduced nothing, so it is never faithful.
 */
export function scriptFidelity(script: string, beats: MetricBeat[]): boolean {
  if (beats.length === 0) return false
  return withoutWhitespace(beats.map((beat) => beat.text).join('')) === withoutWhitespace(script)
}

/** Coverage: beats with at least one completed asset, out of all beats. */
export function coverage(beats: MetricBeat[]): Share {
  const covered = beats.filter((beat) => beat.assets.some((a) => a.status === 'completed'))
  return share(covered.length, beats.length)
}

/**
 * Duplicates: the ids of assets picked for more than one beat. A pick counts whatever
 * became of it, because a second pick that later failed was still a wasted choice.
 */
export function duplicateAssets(beats: MetricBeat[]): string[] {
  const beatsByAsset = new Map<string, Set<string>>()
  for (const beat of beats) {
    for (const asset of beat.assets) {
      const users = beatsByAsset.get(asset.id) ?? new Set<string>()
      users.add(beat.id)
      beatsByAsset.set(asset.id, users)
    }
  }
  return [...beatsByAsset].filter(([, users]) => users.size > 1).map(([assetId]) => assetId)
}

/** The shape the app's prompt asks for: landscape for YouTube, portrait for the rest. */
export function platformOrientation(platform: Platform): 'landscape' | 'portrait' {
  return platform === 'YouTube' ? 'landscape' : 'portrait'
}

/** Orientation match: completed assets shaped like the platform. A square fits neither. */
export function orientationMatch(beats: MetricBeat[], platform: Platform): Share {
  const assets = completedAssets(beats)
  const wanted = platformOrientation(platform)
  const matching = assets.filter((asset) =>
    wanted === 'landscape' ? asset.width > asset.height : asset.height > asset.width
  )
  return share(matching.length, assets.length)
}

/** Resolution: completed videos with a long edge of 1,920 pixels or more, photos 1,880 or more. */
export function resolution(beats: MetricBeat[]): Share {
  const assets = completedAssets(beats)
  const sharp = assets.filter(
    (asset) =>
      Math.max(asset.width, asset.height) >=
      (asset.type === 'photo' ? MIN_PHOTO_LONG_EDGE : MIN_VIDEO_LONG_EDGE)
  )
  return share(sharp.length, assets.length)
}

/** Clip length: completed videos that run between 3 and 30 seconds, both included. */
export function clipLength(beats: MetricBeat[]): Share {
  const videos = completedAssets(beats).filter((asset) => asset.type === 'video')
  const usable = videos.filter(
    (asset) =>
      typeof asset.duration === 'number' &&
      asset.duration >= MIN_CLIP_SECONDS &&
      asset.duration <= MAX_CLIP_SECONDS
  )
  return share(usable.length, videos.length)
}

export interface MetricsInput {
  /** The script the beats were cut from. In idea mode this is the expanded script. */
  script: string
  platform: Platform
  beats: MetricBeat[]
  cost: LlmCost
  seconds: number
}

export function computeMetrics(input: MetricsInput): EvalMetrics {
  const assetIds = duplicateAssets(input.beats)
  return {
    scriptFidelity: scriptFidelity(input.script, input.beats),
    coverage: coverage(input.beats),
    duplicates: { count: assetIds.length, assetIds },
    orientationMatch: orientationMatch(input.beats, input.platform),
    resolution: resolution(input.beats),
    clipLength: clipLength(input.beats),
    cost: input.cost,
    seconds: input.seconds
  }
}
