import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  beatUsingAsset,
  releaseDuplicateAssetRecords
} from '../src/main/services/agent/tool-schemas.ts'

type TestAsset = { id: string; status: string; filePath?: string; error?: string }
type TestBeat = { id: string; assets: TestAsset[] }

function beat(id: string, ...assets: TestAsset[]): TestBeat {
  return { id, assets }
}

describe('beatUsingAsset', () => {
  it('ignores the beat the selection is for', () => {
    const beats = [beat('beat_1', { id: 'video_101', status: 'pending' }), beat('beat_2')]
    assert.equal(beatUsingAsset(beats, 'beat_1', 'video_101'), undefined)
  })

  it('finds another beat that holds the asset', () => {
    const beats = [beat('beat_1', { id: 'video_101', status: 'completed' }), beat('beat_2')]
    assert.equal(beatUsingAsset(beats, 'beat_2', 'video_101')?.id, 'beat_1')
  })

  it('holds the asset for a beat from selection to download', () => {
    for (const status of ['pending', 'downloading', 'completed']) {
      const beats = [beat('beat_1', { id: 'video_101', status }), beat('beat_2')]
      assert.equal(beatUsingAsset(beats, 'beat_2', 'video_101')?.id, 'beat_1', status)
    }
  })

  it('ignores a failed copy, so the asset is free for another beat', () => {
    const beats = [beat('beat_1', { id: 'video_101', status: 'failed' }), beat('beat_2')]
    assert.equal(beatUsingAsset(beats, 'beat_2', 'video_101'), undefined)
  })

  it('matches on the record id, which includes the asset type', () => {
    const beats = [beat('beat_1', { id: 'photo_101', status: 'completed' }), beat('beat_2')]
    assert.equal(beatUsingAsset(beats, 'beat_2', 'video_101'), undefined)
  })

  it('handles beats with no asset list', () => {
    assert.equal(
      beatUsingAsset([{ id: 'beat_1' }, { id: 'beat_2' }], 'beat_2', 'video_101'),
      undefined
    )
  })
})

describe('releaseDuplicateAssetRecords', () => {
  it('keeps the copy that has a file and fails the others', () => {
    const beats = [
      beat('beat_1', { id: 'video_101', status: 'pending' }),
      beat('beat_2', { id: 'video_101', status: 'completed', filePath: '/clips/101.mp4' }),
      beat('beat_3', { id: 'video_101', status: 'pending' })
    ]

    const released = releaseDuplicateAssetRecords(beats)

    assert.deepEqual(released, [
      { recordId: 'video_101', keptIn: 'beat_2', releasedFrom: 'beat_1' },
      { recordId: 'video_101', keptIn: 'beat_2', releasedFrom: 'beat_3' }
    ])
    assert.deepEqual(beats[0].assets[0], {
      id: 'video_101',
      status: 'failed',
      error: 'Duplicate of the asset used for beat_2'
    })
    assert.deepEqual(beats[1].assets[0], {
      id: 'video_101',
      status: 'completed',
      filePath: '/clips/101.mp4'
    })
    assert.equal(beats[2].assets[0].status, 'failed')
  })

  it('keeps the first copy when none has a file', () => {
    const beats = [
      beat('beat_1', { id: 'video_101', status: 'pending' }),
      beat('beat_2', { id: 'video_101', status: 'pending' })
    ]

    const released = releaseDuplicateAssetRecords(beats)

    assert.deepEqual(released, [
      { recordId: 'video_101', keptIn: 'beat_1', releasedFrom: 'beat_2' }
    ])
    assert.equal(beats[0].assets[0].status, 'pending')
    assert.equal(beats[1].assets[0].status, 'failed')
    assert.equal(beats[1].assets[0].error, 'Duplicate of the asset used for beat_1')
  })

  it('does not count a completed copy without a file as the one to keep', () => {
    const beats = [
      beat('beat_1', { id: 'video_101', status: 'pending' }),
      beat('beat_2', { id: 'video_101', status: 'completed' })
    ]

    releaseDuplicateAssetRecords(beats)

    assert.deepEqual(
      beats.map((b) => b.assets[0].status),
      ['pending', 'failed']
    )
  })

  it('leaves records that only one beat holds alone', () => {
    const beats = [
      beat('beat_1', { id: 'video_101', status: 'completed', filePath: '/clips/101.mp4' }),
      beat('beat_2', { id: 'video_102', status: 'pending' }, { id: 'photo_101', status: 'pending' })
    ]
    const before = structuredClone(beats)

    assert.deepEqual(releaseDuplicateAssetRecords(beats), [])
    assert.deepEqual(beats, before)
  })

  it('does not count a copy that already failed', () => {
    const beats = [
      beat('beat_1', { id: 'video_101', status: 'failed', error: 'Rejected by user' }),
      beat('beat_2', { id: 'video_101', status: 'pending' })
    ]

    assert.deepEqual(releaseDuplicateAssetRecords(beats), [])
    assert.equal(beats[0].assets[0].error, 'Rejected by user')
    assert.equal(beats[1].assets[0].status, 'pending')
  })
})
