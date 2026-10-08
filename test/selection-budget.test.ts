import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectionBudgetViolation } from '../src/main/services/agent/tool-schemas.ts'
import { buildStockScoutSystemPrompt } from '../src/main/services/agent/search-mode.ts'

type TestBeat = { id: string; status: string; assets: Array<{ status: string }> }

function beats(...assetCounts: number[]): TestBeat[] {
  return assetCounts.map((count, index) => ({
    id: `beat_${index + 1}`,
    status: 'pending',
    assets: Array.from({ length: count }, () => ({ status: 'pending' }))
  }))
}

function check(
  list: TestBeat[],
  beatId: string,
  maxAssetsPerBeat = 3,
  maxTotalDownloads = 15
): string | null {
  return selectionBudgetViolation({ beats: list, beatId, maxAssetsPerBeat, maxTotalDownloads })
}

describe('selectionBudgetViolation', () => {
  it('allows a selection when under every cap', () => {
    assert.equal(check(beats(0, 0), 'beat_1'), null)
    assert.equal(check(beats(1, 0), 'beat_1'), null)
  })

  it('enforces the per-beat cap', () => {
    assert.equal(check(beats(3, 0), 'beat_1', 3, 15), 'Beat cap of 3 assets reached.')
  })

  it('enforces the total cap', () => {
    assert.equal(check(beats(3, 3, 0), 'beat_3', 3, 6), 'Total download cap of 6 assets reached.')
  })

  it('returns null for an unknown beat so the caller reports it', () => {
    assert.equal(check(beats(0), 'beat_9'), null)
  })

  it('does not count failed assets against the caps', () => {
    const list = beats(0, 0)
    list[0].assets = [{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }]
    assert.equal(check(list, 'beat_1', 3, 15), null)
  })

  describe('reserved budget', () => {
    it('refuses an extra asset when the remaining slots are needed by empty beats', () => {
      // 2 slots left, 2 other beats still empty: beat_1 may not take another.
      const list = beats(1, 0, 0)
      const reason = check(list, 'beat_1', 3, 3)
      assert.match(String(reason), /reserved so every beat gets at least one asset/)
      assert.match(String(reason), /2 other beat/)
    })

    it('allows an extra asset while spare slots remain beyond the empty beats', () => {
      assert.equal(check(beats(1, 0, 0), 'beat_1', 3, 4), null)
    })

    it('always lets an empty beat take its first asset', () => {
      // The reserve only restricts beats that already have something.
      assert.equal(check(beats(2, 0), 'beat_2', 3, 3), null)
    })

    it('counts a beat whose assets all failed as still needing one', () => {
      const list = beats(1, 0)
      list[1].assets = [{ status: 'failed' }]
      assert.match(String(check(list, 'beat_1', 3, 2)), /reserved/)
    })

    it('stops reserving once every other beat has an asset', () => {
      assert.equal(check(beats(1, 1, 1), 'beat_1', 3, 5), null)
    })

    it('guarantees every beat gets an asset even when the model is greedy', () => {
      // Defaults: 3 per beat, 15 total, 8 beats. A greedy model fills beats in
      // order; without the reserve beats 6-8 would get nothing.
      const list = beats(0, 0, 0, 0, 0, 0, 0, 0)
      for (const beat of list) {
        for (let attempt = 0; attempt < 5; attempt++) {
          if (check(list, beat.id, 3, 15) === null) beat.assets.push({ status: 'pending' })
        }
      }

      assert.ok(
        list.every((b) => b.assets.length >= 1),
        `every beat should have an asset, got ${list.map((b) => b.assets.length).join(',')}`
      )
      assert.equal(
        list.reduce((sum, b) => sum + b.assets.length, 0),
        15
      )
    })

    it('still honours the total cap when there are more beats than slots', () => {
      const list = beats(0, 0, 0, 0)
      for (const beat of list) {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (check(list, beat.id, 3, 2) === null) beat.assets.push({ status: 'pending' })
        }
      }
      assert.deepEqual(
        list.map((b) => b.assets.length),
        [1, 1, 0, 0]
      )
    })
  })
})

describe('StockScout prompt guidance for the new rules', () => {
  const prompt = buildStockScoutSystemPrompt({
    searchMode: 'focused',
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 3,
    maxTotalDownloads: 15,
    skipExplicit: true,
    avoidPeople: false
  })

  it('tells the model what to do when a selection is refused', () => {
    assert.match(prompt, /If a selection is refused, the result says why: adjust the choice/)
    assert.match(prompt, /do not retry the same asset/)
  })
})
