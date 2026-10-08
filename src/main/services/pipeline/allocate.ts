export interface AllocationBeat {
  id: string
  /** Keys the beat already holds: earlier picks, picks from before a resume. */
  existing: string[]
  /** Keys the beat must not get: picks the user rejected for it, and downloads that failed. */
  excluded?: string[]
}

export interface AllocationInput {
  /** In script order. Earlier beats are served first. */
  beats: AllocationBeat[]
  /** Beat id to candidate keys, best first. */
  rankingByBeat: Record<string, string[]>
  /** How many assets each beat is asked to have. */
  perBeatTarget: number
  /** The most assets the job may hold in all. */
  totalCap: number
  /** Keys held by any beat. No pick may be one of these. */
  takenKeys: Set<string>
}

export interface Allocation {
  beatId: string
  key: string
}

/**
 * Round-robin in beat order: every beat gets its best free candidate before any beat gets a
 * second. Stops at the cap, counting what the beats hold already. Never gives one candidate to
 * two beats, and never gives a beat one it must not have. A beat whose ranking has no free
 * candidate left stays short; the broader search is for beats with nothing at all.
 */
export function allocateSlots(input: AllocationInput): Allocation[] {
  const taken = new Set(input.takenKeys)
  const held = new Map(input.beats.map((beat) => [beat.id, beat.existing.length]))
  let total = input.beats.reduce((sum, beat) => sum + beat.existing.length, 0)
  const allocations: Allocation[] = []

  for (let round = 1; round <= input.perBeatTarget; round++) {
    for (const beat of input.beats) {
      if (total >= input.totalCap) return allocations
      if ((held.get(beat.id) ?? 0) >= round) continue

      const excluded = new Set(beat.excluded ?? [])
      const key = (input.rankingByBeat[beat.id] ?? []).find(
        (candidate) => !taken.has(candidate) && !excluded.has(candidate)
      )
      if (!key) continue

      taken.add(key)
      held.set(beat.id, (held.get(beat.id) ?? 0) + 1)
      total++
      allocations.push({ beatId: beat.id, key })
    }
  }
  return allocations
}

/** True when the beat's ranking still has a candidate it may be given. */
export function hasFreeCandidate(
  beat: AllocationBeat,
  ranking: string[] | undefined,
  takenKeys: Set<string>
): boolean {
  const excluded = new Set(beat.excluded ?? [])
  return (ranking ?? []).some((key) => !takenKeys.has(key) && !excluded.has(key))
}
