import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  areBeatsSatisfiedForLoop,
  assetsNeededPerBeat,
  getUnfulfilledBeats,
  selectionBudgetViolation
} from '../src/main/services/agent/tool-schemas.ts'

type TestBeat = { id: string; status: string; assets: Array<{ status: string }> }

/** One beat per entry; each entry lists the statuses of that beat's assets. */
function beats(...assets: string[][]): TestBeat[] {
  return assets.map((statuses, index) => ({
    id: `beat_${index + 1}`,
    status: 'pending',
    assets: statuses.map((status) => ({ status }))
  }))
}

describe('assetsNeededPerBeat', () => {
  const needed = (beatCount: number, optionsPerBeat: number, maxTotalDownloads: number): number =>
    assetsNeededPerBeat({ beatCount, optionsPerBeat, maxTotalDownloads })

  it('is the target while the cap has room for it', () => {
    assert.equal(needed(5, 3, 15), 3)
    assert.equal(needed(1, 3, 15), 3)
    assert.equal(needed(5, 1, 15), 1)
  })

  it('is no more than an even share of the cap, rounded down', () => {
    assert.equal(needed(4, 3, 15), 3, '15 over 4 beats is 3 each')
    assert.equal(needed(6, 5, 15), 2, '15 over 6 beats is 2 each')
    assert.equal(needed(8, 3, 15), 1)
  })

  it('is at least one, however many beats share the cap', () => {
    assert.equal(needed(40, 3, 15), 1)
    assert.equal(needed(2, 3, 1), 1)
  })

  it('is the target when there are no beats yet', () => {
    assert.equal(needed(0, 3, 15), 3)
  })
})

describe('getUnfulfilledBeats', () => {
  it('lists beats with no usable asset by default', () => {
    const list = beats([], ['failed', 'failed'], ['pending'], ['failed', 'completed'])
    assert.deepEqual(
      getUnfulfilledBeats(list).map((beat) => beat.id),
      ['beat_1', 'beat_2']
    )
  })

  it('lists beats with fewer usable assets than are needed', () => {
    const list = beats([], ['pending'], ['pending', 'downloading'], ['completed', 'failed'])
    assert.deepEqual(
      getUnfulfilledBeats(list, 2).map((beat) => beat.id),
      ['beat_1', 'beat_2', 'beat_4']
    )
    assert.deepEqual(getUnfulfilledBeats(list, 0), [])
  })

  it('treats a beat with no asset list as having none', () => {
    assert.deepEqual(getUnfulfilledBeats([{ status: 'pending' }], 1).length, 1)
  })
})

describe('areBeatsSatisfiedForLoop', () => {
  it('is satisfied when every beat has one asset and the target is one', () => {
    assert.equal(areBeatsSatisfiedForLoop(beats(['pending'], ['pending']), 10), true)
    assert.equal(areBeatsSatisfiedForLoop(beats(['pending'], ['pending']), 10, 1), true)
    assert.equal(areBeatsSatisfiedForLoop(beats(['pending'], []), 10, 1), false)
  })

  it('wants every beat to have the target number of options', () => {
    const oneEach = beats(['pending'], ['pending'])
    assert.equal(areBeatsSatisfiedForLoop(oneEach, 10, 2), false)
    assert.equal(areBeatsSatisfiedForLoop(beats(['pending', 'pending'], ['pending']), 10, 2), false)
    assert.equal(
      areBeatsSatisfiedForLoop(beats(['pending', 'pending'], ['pending', 'pending']), 10, 2),
      true
    )
  })

  it('does not count a failed asset as an option', () => {
    assert.equal(
      areBeatsSatisfiedForLoop(beats(['completed', 'failed'], ['completed', 'completed']), 10, 2),
      false
    )
  })

  it('asks for no more than a beat has of the cap', () => {
    // 4 downloads over 2 beats: a target of 3 is 2 each.
    assert.equal(
      areBeatsSatisfiedForLoop(beats(['pending', 'pending'], ['pending', 'pending']), 4, 3),
      true
    )
    // Over 4 beats it is 1 each.
    assert.equal(
      areBeatsSatisfiedForLoop(beats(['pending'], ['pending'], ['pending'], ['pending']), 4, 3),
      true
    )
  })

  it('is satisfied once the cap is full, whatever the beats hold', () => {
    assert.equal(areBeatsSatisfiedForLoop(beats(['pending'], [], []), 1, 3), true)
    assert.equal(areBeatsSatisfiedForLoop(beats(['completed', 'completed'], []), 2, 1), true)
    assert.equal(areBeatsSatisfiedForLoop(beats(['failed'], []), 1, 1), false)
  })

  it('has nothing to fulfil in an empty list of beats, and the loop checks for beats itself', () => {
    assert.equal(
      areBeatsSatisfiedForLoop([], 5, 1),
      true,
      'nothing to fulfil; the loop checks for beats'
    )
  })
})

describe('the per-beat cap is the target', () => {
  it('refuses an option past the target, and allows one up to it', () => {
    const list = beats(['pending', 'pending'], ['pending'])
    const check = (beatId: string): string | null =>
      selectionBudgetViolation({ beats: list, beatId, maxAssetsPerBeat: 2, maxTotalDownloads: 15 })

    assert.equal(check('beat_1'), 'Beat cap of 2 assets reached.')
    assert.equal(check('beat_2'), null)
  })
})
