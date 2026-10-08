import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_FILTER_LIMITS,
  filterCandidates,
  type FilterRules
} from '../../src/main/services/pipeline/filter.ts'
import { photoCand, videoCand } from '../support/pipeline-context.ts'

const rules: FilterRules = {
  shape: 'landscape',
  minLongEdge: { ...DEFAULT_FILTER_LIMITS.minLongEdge },
  videoSeconds: { ...DEFAULT_FILTER_LIMITS.videoSeconds },
  avoidPeople: false,
  skipExplicit: true,
  rejectedKeys: new Set()
}

const keys = (list: Array<{ type: string; pexelsId: number }>): string[] =>
  list.map((c) => `${c.type}_${c.pexelsId}`)

describe('filterCandidates', () => {
  it('keeps a full HD landscape clip of a usable length', () => {
    const kept = filterCandidates([videoCand(1, 'rain-on-a-window')], rules)
    assert.deepEqual(keys(kept), ['video_1'])
  })

  it('drops a video whose files are all below the long-edge minimum', () => {
    const small = videoCand(1, 'small-clip', [
      ['hd', 1280, 720],
      ['sd', 640, 360]
    ])
    assert.deepEqual(filterCandidates([small], rules), [])
  })

  it('judges a file that does not say its size by the size of the video', () => {
    const unsized = videoCand(1, 'unsized-file', [['hd', 1920, 1080]])
    unsized.variants = [
      { quality: 'hd', fileType: 'video/mp4', url: 'https://videos.pexels.com/1.mp4' }
    ]
    assert.deepEqual(keys(filterCandidates([unsized], rules)), ['video_1'])
  })

  it('drops a clip shorter or longer than the length limits', () => {
    const results = [
      videoCand(1, 'too-short', undefined, 2),
      videoCand(2, 'just-right', undefined, 12),
      videoCand(3, 'too-long', undefined, 45)
    ]
    assert.deepEqual(keys(filterCandidates(results, rules)), ['video_2'])
  })

  it('keeps a clip at either end of the length limits', () => {
    const results = [videoCand(1, 'at-min', undefined, 4), videoCand(2, 'at-max', undefined, 30)]
    assert.deepEqual(keys(filterCandidates(results, rules)), ['video_1', 'video_2'])
  })

  it('lets a clip that does not say its length pass', () => {
    const unknown = videoCand(1, 'no-length')
    unknown.duration = 0
    assert.deepEqual(keys(filterCandidates([unknown], rules)), ['video_1'])
  })

  it('drops a photo below the long-edge minimum', () => {
    const results = [photoCand(1, 'tiny photo', 1200, 800), photoCand(2, 'big photo', 4000, 2500)]
    assert.deepEqual(keys(filterCandidates(results, rules)), ['photo_2'])
  })

  it('drops a candidate with no file that can be downloaded', () => {
    const empty = videoCand(1, 'no-files')
    empty.variants = []
    const noPhotoFiles = photoCand(2, 'no files')
    noPhotoFiles.variants = []
    assert.deepEqual(filterCandidates([empty, noPhotoFiles], rules), [])
  })

  it('drops a candidate the beat must not get', () => {
    const results = [videoCand(1, 'first-clip'), videoCand(2, 'second-clip')]
    const kept = filterCandidates(results, { ...rules, rejectedKeys: new Set(['video_1']) })
    assert.deepEqual(keys(kept), ['video_2'])
  })

  it('drops a result that mentions people when avoid people is on, and keeps it when it is off', () => {
    const results = [
      videoCand(1, 'a-crowd-of-people-walking'),
      videoCand(2, 'an-empty-street-at-dawn')
    ]
    assert.deepEqual(keys(filterCandidates(results, { ...rules, avoidPeople: true })), ['video_2'])
    assert.deepEqual(keys(filterCandidates(results, rules)), ['video_1', 'video_2'])
  })

  it('drops an explicit result when skip explicit is on, and keeps it when it is off', () => {
    const results = [photoCand(1, 'nude beach scene'), photoCand(2, 'quiet beach scene')]
    assert.deepEqual(keys(filterCandidates(results, rules)), ['photo_2'])
    assert.deepEqual(keys(filterCandidates(results, { ...rules, skipExplicit: false })), [
      'photo_1',
      'photo_2'
    ])
  })

  it('lets square results stand in only when nothing of the right shape is left', () => {
    const landscape = videoCand(1, 'wide-clip')
    const square = photoCand(2, 'square photo', 3000, 3000)
    const portrait = photoCand(3, 'tall photo', 2500, 4000)

    assert.deepEqual(keys(filterCandidates([square, landscape, portrait], rules)), ['video_1'])
    assert.deepEqual(keys(filterCandidates([square, portrait], rules)), ['photo_2'])
    assert.deepEqual(filterCandidates([portrait], rules), [])
  })

  it('counts a candidate once when two queries found it', () => {
    const results = [
      videoCand(1, 'same-clip'),
      videoCand(2, 'other-clip'),
      videoCand(1, 'same-clip')
    ]
    assert.deepEqual(keys(filterCandidates(results, rules)), ['video_1', 'video_2'])
  })

  it('keeps the order the results were found in', () => {
    const results = [
      videoCand(5, 'e'),
      photoCand(1, 'a photo'),
      videoCand(3, 'c'),
      videoCand(4, 'd')
    ]
    assert.deepEqual(keys(filterCandidates(results, rules)), [
      'video_5',
      'photo_1',
      'video_3',
      'video_4'
    ])
  })

  it('stops at the limit', () => {
    const results = Array.from({ length: 20 }, (_, i) => videoCand(i + 1, `clip-${i + 1}`))
    assert.equal(filterCandidates(results, rules).length, DEFAULT_CANDIDATE_LIMIT)
    assert.equal(filterCandidates(results, rules, 3).length, 3)
    assert.deepEqual(keys(filterCandidates(results, rules, 3)), ['video_1', 'video_2', 'video_3'])
  })

  it('judges a portrait video by its long edge', () => {
    const portraitRules: FilterRules = { ...rules, shape: 'portrait' }
    const tall = videoCand(1, 'tall-clip', [
      ['hd', 1080, 1920],
      ['sd', 540, 960]
    ])
    assert.deepEqual(keys(filterCandidates([tall], portraitRules)), ['video_1'])
    assert.deepEqual(filterCandidates([tall], rules), [])
  })
})
