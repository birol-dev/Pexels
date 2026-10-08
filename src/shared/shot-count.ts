/**
 * How many shots a script needs, shown before a job starts. It has no imports, so the renderer
 * and Node's test runner load it directly.
 */

/** The most downloads a job accepts. */
export const MAX_TOTAL_DOWNLOADS = 100

/** About one shot per 12 spoken words: 3 to 6 seconds at a normal voiceover pace. */
export function recommendedShotCount(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 12))
}

/** The download cap that gives each of `shots` shots an asset, within what a job accepts. */
export function capForShots(shots: number): number {
  return Math.min(Math.max(1, Math.ceil(shots)), MAX_TOTAL_DOWNLOADS)
}
