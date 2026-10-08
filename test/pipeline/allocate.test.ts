import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateSlots,
  hasFreeCandidate,
  type AllocationBeat
} from '../../src/main/services/pipeline/allocate.ts'

function beats(...ids: string[]): AllocationBeat[] {
  return ids.map((id) => ({ id, existing: [] }))
}

function allocate(
  beatList: AllocationBeat[],
  rankingByBeat: Record<string, string[]>,
  over: { perBeatTarget?: number; totalCap?: number } = {}
): Array<[string, string]> {
  const takenKeys = new Set(beatList.flatMap((beat) => beat.existing))
  return allocateSlots({
    beats: beatList,
    rankingByBeat,
    perBeatTarget: over.perBeatTarget ?? 1,
    totalCap: over.totalCap ?? 100,
    takenKeys
  }).map((a) => [a.beatId, a.key])
}

describe('allocateSlots', () => {
  it('gives each beat its best candidate', () => {
    const result = allocate(beats('beat_1', 'beat_2'), {
      beat_1: ['video_1', 'video_2'],
      beat_2: ['video_3', 'video_4']
    })
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_2', 'video_3']
    ])
  })

  it('stops at the cap when it is below the beat count, serving earlier beats first', () => {
    const result = allocate(
      beats('beat_1', 'beat_2', 'beat_3', 'beat_4'),
      {
        beat_1: ['video_1'],
        beat_2: ['video_2'],
        beat_3: ['video_3'],
        beat_4: ['video_4']
      },
      { totalCap: 2 }
    )
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_2', 'video_2']
    ])
  })

  it('gives every beat one before any beat gets a second, when the target is 2', () => {
    const result = allocate(
      beats('beat_1', 'beat_2'),
      {
        beat_1: ['video_1', 'video_2', 'video_3'],
        beat_2: ['video_4', 'video_5']
      },
      { perBeatTarget: 2 }
    )
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_2', 'video_4'],
      ['beat_1', 'video_2'],
      ['beat_2', 'video_5']
    ])
  })

  it('gives the second round to the beats that fit under the cap, not past it', () => {
    const result = allocate(
      beats('beat_1', 'beat_2'),
      {
        beat_1: ['video_1', 'video_2'],
        beat_2: ['video_3', 'video_4']
      },
      { perBeatTarget: 2, totalCap: 3 }
    )
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_2', 'video_3'],
      ['beat_1', 'video_2']
    ])
  })

  it('gives a candidate ranked first by two beats to the earlier beat only', () => {
    const result = allocate(beats('beat_1', 'beat_2'), {
      beat_1: ['video_1', 'video_2'],
      beat_2: ['video_1', 'video_3']
    })
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_2', 'video_3']
    ])
  })

  it('counts what beats hold already, and picks only for the free slots', () => {
    const held: AllocationBeat[] = [
      { id: 'beat_1', existing: ['video_1'] },
      { id: 'beat_2', existing: [] },
      { id: 'beat_3', existing: ['video_9'] }
    ]
    const result = allocate(held, {
      beat_1: ['video_1', 'video_2'],
      beat_2: ['video_1', 'video_3'],
      beat_3: ['video_4']
    })
    // beat_1 and beat_3 hold one each. beat_2 cannot take video_1, which beat_1 holds.
    assert.deepEqual(result, [['beat_2', 'video_3']])
  })

  it('counts held assets against the cap', () => {
    const held: AllocationBeat[] = [
      { id: 'beat_1', existing: ['video_1'] },
      { id: 'beat_2', existing: [] }
    ]
    assert.deepEqual(allocate(held, { beat_2: ['video_2'] }, { totalCap: 1 }), [])
    assert.deepEqual(allocate(held, { beat_2: ['video_2'] }, { totalCap: 2 }), [
      ['beat_2', 'video_2']
    ])
  })

  it('skips a beat whose candidates are all taken, and still serves the others', () => {
    const result = allocate(beats('beat_1', 'beat_2', 'beat_3'), {
      beat_1: ['video_1'],
      beat_2: ['video_1'],
      beat_3: ['video_1', 'video_2']
    })
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_3', 'video_2']
    ])
  })

  it('skips a candidate the beat must not get', () => {
    const list: AllocationBeat[] = [{ id: 'beat_1', existing: [], excluded: ['video_1'] }]
    assert.deepEqual(allocate(list, { beat_1: ['video_1', 'video_2'] }), [['beat_1', 'video_2']])
  })

  it('gives nothing to a beat with no ranking, or an empty one', () => {
    const result = allocate(beats('beat_1', 'beat_2', 'beat_3'), {
      beat_1: [],
      beat_3: ['video_3']
    })
    assert.deepEqual(result, [['beat_3', 'video_3']])
  })

  it('takes every candidate when there are fewer than the slots', () => {
    const result = allocate(
      beats('beat_1'),
      { beat_1: ['video_1', 'video_2'] },
      { perBeatTarget: 5 }
    )
    assert.deepEqual(result, [
      ['beat_1', 'video_1'],
      ['beat_1', 'video_2']
    ])
  })

  it('never picks a key twice across all rounds and beats', () => {
    const result = allocate(
      beats('beat_1', 'beat_2', 'beat_3'),
      {
        beat_1: ['video_1', 'video_2', 'video_3'],
        beat_2: ['video_1', 'video_2', 'video_3'],
        beat_3: ['video_1', 'video_2', 'video_3']
      },
      { perBeatTarget: 3 }
    )
    const picked = result.map(([, key]) => key)
    assert.equal(new Set(picked).size, picked.length)
    assert.equal(picked.length, 3)
  })

  it('does not change the taken set it was given', () => {
    const taken = new Set(['video_9'])
    allocateSlots({
      beats: beats('beat_1'),
      rankingByBeat: { beat_1: ['video_1'] },
      perBeatTarget: 1,
      totalCap: 5,
      takenKeys: taken
    })
    assert.deepEqual([...taken], ['video_9'])
  })
})

describe('hasFreeCandidate', () => {
  const beat: AllocationBeat = { id: 'beat_1', existing: [], excluded: ['video_2'] }

  it('is true when the ranking has a key that is neither taken nor excluded', () => {
    assert.equal(hasFreeCandidate(beat, ['video_1', 'video_2'], new Set()), true)
  })

  it('is false when every ranked key is taken or excluded', () => {
    assert.equal(hasFreeCandidate(beat, ['video_1', 'video_2'], new Set(['video_1'])), false)
  })

  it('is false for an empty or missing ranking', () => {
    assert.equal(hasFreeCandidate(beat, [], new Set()), false)
    assert.equal(hasFreeCandidate(beat, undefined, new Set()), false)
  })
})
