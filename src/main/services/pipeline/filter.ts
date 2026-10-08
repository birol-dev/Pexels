import { isHiddenBySafety } from '../agent/content-filters.ts'
import { shapeOf, type Shape } from '../agent/tool-results.ts'
import { chooseVariant } from '../pexels/choose-variant.ts'
import { candidateKey, type PexelsCandidate } from '../pexels/candidates.ts'

/** Candidates kept for one beat. The ranking prompt grows with this. */
export const DEFAULT_CANDIDATE_LIMIT = 12

export interface FilterRules {
  shape: Shape
  /** The shortest long edge a video file or a photo source may have. */
  minLongEdge: { video: number; photo: number }
  /** Clips shorter than min or longer than max are hard to edit with. */
  videoSeconds: { min: number; max: number }
  avoidPeople: boolean
  skipExplicit: boolean
  /** Keys the beat must not get: picks the user rejected for it. */
  rejectedKeys: Set<string>
}

export const DEFAULT_FILTER_LIMITS = {
  minLongEdge: { video: 1920, photo: 1600 },
  videoSeconds: { min: 4, max: 30 }
} as const

function longEdge(width: number | undefined, height: number | undefined): number {
  return Math.max(width ?? 0, height ?? 0)
}

/**
 * Keeps the candidates that fit the job, in the order they were found, at most `limit`. A
 * candidate that shows up twice (two queries found it) counts once. Square results stand in for
 * either shape only when no result of the right shape is left. Duplicates across beats are kept:
 * allocation makes the picks unique.
 */
export function filterCandidates(
  results: PexelsCandidate[],
  rules: FilterRules,
  limit = DEFAULT_CANDIDATE_LIMIT
): PexelsCandidate[] {
  const seen = new Set<string>()
  const passing = results.filter((result) => {
    const key = candidateKey(result.type, result.pexelsId)
    if (seen.has(key)) return false
    seen.add(key)
    if (rules.rejectedKeys.has(key)) return false
    if (isHiddenBySafety(result.about ?? '', rules)) return false

    // A candidate with no file the app can download is of no use.
    const file = chooseVariant(result)
    if (!file) return false

    if (result.type === 'video') {
      // A file that does not say its size is judged by the size of the video.
      const edge = longEdge(file.width, file.height) || longEdge(result.width, result.height)
      if (edge < rules.minLongEdge.video) return false
      // A clip that does not say its length passes.
      const seconds = result.duration ?? 0
      if (seconds > 0 && (seconds < rules.videoSeconds.min || seconds > rules.videoSeconds.max)) {
        return false
      }
    } else if (longEdge(result.width, result.height) < rules.minLongEdge.photo) {
      return false
    }
    return true
  })

  const shapeOfResult = (result: PexelsCandidate): Shape => shapeOf(result.width, result.height)
  const rightShape = passing.filter((result) => shapeOfResult(result) === rules.shape)
  const kept =
    rightShape.length > 0
      ? rightShape
      : passing.filter((result) => shapeOfResult(result) === 'square')
  return kept.slice(0, limit)
}
