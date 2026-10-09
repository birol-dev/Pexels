import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describeCandidate,
  initialPipelineState,
  parsePipelineState
} from '../../src/main/services/pipeline/context.ts'
import { photoCand, videoCand } from '../support/pipeline-context.ts'

describe('parsePipelineState', () => {
  it('reads back a state that was saved', () => {
    const state = {
      ...initialPipelineState(),
      step: 'ranked' as const,
      candidatesByBeat: { beat_1: ['video_1', 'photo_2'] },
      rankingByBeat: { beat_1: ['photo_2'] },
      retriedBeats: ['beat_3'],
      broaderQueries: { beat_3: ['sea'] },
      modelCalls: 4
    }
    assert.deepEqual(parsePipelineState(JSON.parse(JSON.stringify(state))), state)
  })

  it('returns undefined for anything that is not a state', () => {
    assert.equal(parsePipelineState(undefined), undefined)
    assert.equal(parsePipelineState(null), undefined)
    assert.equal(parsePipelineState('ranked'), undefined)
    assert.equal(parsePipelineState({}), undefined)
    assert.equal(parsePipelineState({ step: 'sleeping' }), undefined)
    assert.equal(parsePipelineState({ step: 5 }), undefined)
  })

  it('fills in what a state is missing and drops what is the wrong type', () => {
    const state = parsePipelineState({
      step: 'searched',
      candidatesByBeat: { beat_1: ['video_1', 5, null], beat_2: 'video_2', beat_3: ['photo_3'] },
      rankingByBeat: [],
      retriedBeats: ['beat_1', 7],
      modelCalls: -2
    })
    assert.deepEqual(state, {
      step: 'searched',
      candidatesByBeat: { beat_1: ['video_1'], beat_3: ['photo_3'] },
      rankingByBeat: {},
      retriedBeats: ['beat_1'],
      broaderQueries: {},
      modelCalls: 0
    })
  })

  it('keeps every step name the pipeline writes', () => {
    for (const step of ['planned', 'searched', 'ranked', 'allocated', 'retried', 'done']) {
      assert.equal(parsePipelineState({ step })?.step, step)
    }
  })
})

describe('describeCandidate', () => {
  it('gives a video its key, shape and length', () => {
    const described = describeCandidate(videoCand(7, 'waves-on-a-beach', undefined, 12))
    assert.equal(described.key, 'video_7')
    assert.equal(described.shape, 'landscape')
    assert.equal(described.seconds, 12)
    assert.equal(described.about, 'waves on a beach')
    assert.equal(
      described.thumbnailUrl,
      'https://images.pexels.com/videos/7/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'
    )
  })

  it('gives a photo no length, and its tiny size as the thumbnail', () => {
    const described = describeCandidate(photoCand(8, 'Sea foam', 3000, 3000))
    assert.equal(described.key, 'photo_8')
    assert.equal(described.shape, 'square')
    assert.equal(described.seconds, undefined)
    assert.equal(
      described.thumbnailUrl,
      'https://images.pexels.com/photos/8/pexels-photo-8.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'
    )
  })

  it('gives a candidate with no usable thumbnail none, so it is judged by its description', () => {
    const candidate = photoCand(8, 'Sea foam')
    const described = describeCandidate({
      ...candidate,
      variants: candidate.variants.filter((variant) => variant.label !== 'tiny')
    })
    assert.equal(described.thumbnailUrl, undefined)
    assert.equal(described.about, 'Sea foam')
  })

  it('uses an empty description when the candidate has none', () => {
    const candidate = photoCand(9, 'x')
    delete candidate.about
    assert.equal(describeCandidate(candidate).about, '')
  })
})
