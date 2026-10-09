import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clipLength,
  computeMetrics,
  coverage,
  duplicateAssets,
  orientationMatch,
  platformOrientation,
  resolution,
  scriptFidelity,
  type MetricAsset,
  type MetricBeat
} from '../../scripts/eval/metrics.ts'

/** A completed 1920x1080 asset; the id's prefix decides whether it is a photo or a video. */
function asset(id: string, overrides: Partial<MetricAsset> = {}): MetricAsset {
  const type = id.startsWith('photo') ? 'photo' : 'video'
  return {
    id,
    type,
    width: 1920,
    height: 1080,
    duration: type === 'video' ? 12 : undefined,
    status: 'completed',
    ...overrides
  }
}

function beat(id: string, text: string, assets: MetricAsset[] = []): MetricBeat {
  return { id, text, assets }
}

describe('eval metrics: script fidelity', () => {
  const script = 'The sea is calm.\n\nA boat  leaves the harbor. It does not return.'

  it('holds when the joined beats are the script, whatever the whitespace', () => {
    const noBreakSpace = String.fromCharCode(0xa0)
    const beats = [
      beat('beat_1', 'The sea is calm. '),
      beat('beat_2', 'A boat leaves the harbor.'),
      beat('beat_3', `${noBreakSpace}It does not return.\n`)
    ]
    assert.equal(scriptFidelity(script, beats), true)
  })

  it('fails when a sentence is dropped, reworded or moved', () => {
    const first = beat('beat_1', 'The sea is calm.')
    const second = beat('beat_2', 'A boat leaves the harbor.')
    const third = beat('beat_3', 'It does not return.')

    assert.equal(scriptFidelity(script, [first, third]), false)
    assert.equal(
      scriptFidelity(script, [first, beat('beat_2', 'A ship leaves the harbor.'), third]),
      false
    )
    assert.equal(scriptFidelity(script, [second, first, third]), false)
  })

  it('fails when the job produced no beats', () => {
    assert.equal(scriptFidelity(script, []), false)
    assert.equal(scriptFidelity('', []), false)
  })
})

describe('eval metrics: coverage', () => {
  it('counts beats with at least one completed asset', () => {
    const beats = [
      beat('beat_1', 'a', [asset('video_1')]),
      beat('beat_2', 'b', [asset('video_2', { status: 'failed' })]),
      beat('beat_3', 'c'),
      beat('beat_4', 'd', [asset('video_4', { status: 'failed' }), asset('photo_4')])
    ]
    assert.deepEqual(coverage(beats), { count: 2, total: 4, ratio: 0.5 })
  })

  it('has no ratio without beats', () => {
    assert.deepEqual(coverage([]), { count: 0, total: 0, ratio: null })
  })
})

describe('eval metrics: duplicates', () => {
  it('lists each asset picked for more than one beat once', () => {
    const beats = [
      beat('beat_1', 'a', [asset('video_7'), asset('photo_9')]),
      beat('beat_2', 'b', [asset('video_8')]),
      beat('beat_3', 'c', [asset('video_7')]),
      beat('beat_4', 'd', [asset('video_7'), asset('photo_9')])
    ]
    assert.deepEqual(duplicateAssets(beats), ['video_7', 'photo_9'])
  })

  it('counts a second pick even when its download failed', () => {
    const beats = [
      beat('beat_1', 'a', [asset('video_7')]),
      beat('beat_2', 'b', [asset('video_7', { status: 'failed' })])
    ]
    assert.deepEqual(duplicateAssets(beats), ['video_7'])
  })

  it('does not confuse a photo and a video with the same number, or a repeat inside one beat', () => {
    const beats = [
      beat('beat_1', 'a', [asset('video_5'), asset('video_5')]),
      beat('beat_2', 'b', [asset('photo_5')])
    ]
    assert.deepEqual(duplicateAssets(beats), [])
  })
})

describe('eval metrics: orientation match', () => {
  const landscape = asset('video_1', { width: 1920, height: 1080 })
  const portrait = asset('video_2', { width: 1080, height: 1920 })
  const square = asset('photo_3', { width: 2000, height: 2000 })
  const beats = [beat('beat_1', 'a', [landscape, portrait]), beat('beat_2', 'b', [square])]

  it('wants landscape for YouTube and portrait for the vertical platforms', () => {
    assert.equal(platformOrientation('YouTube'), 'landscape')
    assert.equal(platformOrientation('Shorts'), 'portrait')
    assert.equal(platformOrientation('TikTok'), 'portrait')
    assert.equal(platformOrientation('Instagram Reels'), 'portrait')
  })

  it('counts completed assets shaped like the platform; a square fits neither', () => {
    assert.deepEqual(orientationMatch(beats, 'YouTube'), { count: 1, total: 3, ratio: 1 / 3 })
    assert.deepEqual(orientationMatch(beats, 'Shorts'), { count: 1, total: 3, ratio: 1 / 3 })
  })

  it('ignores assets that were not downloaded', () => {
    const pending = asset('video_4', { width: 1080, height: 1920, status: 'pending' })
    const failed = asset('video_5', { width: 1080, height: 1920, status: 'failed' })
    assert.deepEqual(
      orientationMatch([beat('beat_1', 'a', [landscape, pending, failed])], 'TikTok'),
      {
        count: 0,
        total: 1,
        ratio: 0
      }
    )
    assert.deepEqual(orientationMatch([], 'TikTok'), { count: 0, total: 0, ratio: null })
  })
})

describe('eval metrics: resolution', () => {
  it('passes completed videos of 1,920 pixels and photos of 1,880 pixels on the long edge', () => {
    const beats = [
      beat('beat_1', 'a', [
        asset('video_1', { width: 1920, height: 1080 }),
        asset('video_2', { width: 1080, height: 1920 }),
        asset('photo_3', { width: 6000, height: 4000 })
      ]),
      beat('beat_2', 'b', [
        asset('video_4', { width: 1280, height: 720 }),
        asset('photo_5', { width: 1879, height: 1879 }),
        asset('video_6', { width: 3840, height: 2160, status: 'failed' })
      ])
    ]
    assert.deepEqual(resolution(beats), { count: 3, total: 5, ratio: 0.6 })
  })

  it('counts the large2x photo the app downloads as sharp, but not a video of the same size', () => {
    const beats = [
      beat('beat_1', 'a', [
        asset('photo_1', { width: 1880, height: 1253 }),
        asset('video_2', { width: 1880, height: 1058 })
      ])
    ]
    assert.deepEqual(resolution(beats), { count: 1, total: 2, ratio: 0.5 })
  })
})

describe('eval metrics: clip length', () => {
  it('passes completed videos of 3 to 30 seconds, both ends included', () => {
    const beats = [
      beat('beat_1', 'a', [
        asset('video_1', { duration: 3 }),
        asset('video_2', { duration: 30 }),
        asset('video_3', { duration: 2.9 }),
        asset('video_4', { duration: 31 }),
        asset('video_5', { duration: undefined })
      ]),
      beat('beat_2', 'b', [asset('photo_6'), asset('video_7', { duration: 10, status: 'failed' })])
    ]
    assert.deepEqual(clipLength(beats), { count: 2, total: 5, ratio: 0.4 })
  })

  it('has no ratio when the job downloaded no video', () => {
    assert.deepEqual(clipLength([beat('beat_1', 'a', [asset('photo_1')])]), {
      count: 0,
      total: 0,
      ratio: null
    })
  })
})

describe('eval metrics: the whole set', () => {
  it('puts every metric of the table together and passes cost and time through', () => {
    const beats = [
      beat('beat_1', 'One. ', [asset('video_1', { duration: 45 })]),
      beat('beat_2', 'Two.', [asset('video_1', { duration: 45 }), asset('photo_2')]),
      beat('beat_3', ' Three.')
    ]
    const cost = { llmCalls: 6, inputTokens: 9000, cachedInputTokens: 4000, outputTokens: 700 }

    assert.deepEqual(
      computeMetrics({
        script: 'One. Two. Three.',
        platform: 'YouTube',
        beats,
        cost,
        seconds: 42.5
      }),
      {
        scriptFidelity: true,
        coverage: { count: 2, total: 3, ratio: 2 / 3 },
        duplicates: { count: 1, assetIds: ['video_1'] },
        orientationMatch: { count: 3, total: 3, ratio: 1 },
        resolution: { count: 3, total: 3, ratio: 1 },
        clipLength: { count: 0, total: 2, ratio: 0 },
        cost,
        seconds: 42.5
      }
    )
  })
})
