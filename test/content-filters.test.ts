import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALL_RESULTS_HIDDEN_NOTE,
  applySafetyFilters,
  isExplicitText,
  isHiddenBySafety,
  isQueryBlocked,
  mentionsPeople,
  safetyFilterReport
} from '../src/main/services/agent/content-filters.ts'

describe('mentionsPeople', () => {
  it('finds a person, singular or plural', () => {
    for (const text of [
      'a person walking',
      'two people at a table',
      'woman walking in a park',
      'women laughing',
      'a man with a hat',
      'men at work',
      'boys and girls playing',
      'children on a swing',
      'a baby smiling',
      'a happy family at dinner',
      'close up of a face',
      'portrait of an old fisherman',
      'a crowd at a concert',
      'businessmen shaking hands',
      'a student reading',
      'workers on a building site',
      'teenagers taking a selfie'
    ]) {
      assert.equal(mentionsPeople(text), true, text)
    }
  })

  it('finds the word in a page slug, with spaces in place of hyphens', () => {
    assert.equal(mentionsPeople('woman walking on a beach'), true)
    assert.equal(mentionsPeople('waves crashing on rocks'), false)
  })

  it('finds a possessive', () => {
    assert.equal(mentionsPeople("woman's hands on a keyboard"), true)
    assert.equal(mentionsPeople("the child's toy on the floor"), true)
    assert.equal(mentionsPeople("a baby's shoes"), true)
  })

  it('matches whole words only', () => {
    assert.equal(mentionsPeople('manhattan skyline at dusk'), false)
    assert.equal(mentionsPeople('human-made structures'), false)
    assert.equal(mentionsPeople('human machine interface'), false)
    assert.equal(mentionsPeople('romantic dinner table'), false)
    assert.equal(mentionsPeople('a woodworker bench'), false)
    assert.equal(mentionsPeople('interfaces on a screen'), false)
    assert.equal(mentionsPeople('amanda lights'), false)
    assert.equal(mentionsPeople('kidney beans'), false)
    assert.equal(mentionsPeople('familiar road'), false)
  })

  it('ignores case', () => {
    assert.equal(mentionsPeople('WOMAN WALKING'), true)
    assert.equal(mentionsPeople('Two People'), true)
    assert.equal(mentionsPeople('MANHATTAN'), false)
  })

  it('lets a description without people, or with none at all, pass', () => {
    assert.equal(mentionsPeople(''), false)
    assert.equal(mentionsPeople('empty office desk'), false)
    assert.equal(mentionsPeople('hands typing on a laptop'), false)
    assert.equal(mentionsPeople('silhouette against a sunset'), false)
  })
})

describe('isExplicitText', () => {
  it('finds explicit words, with any case', () => {
    for (const text of ['nude beach', 'NSFW art', 'naked', 'sexy lingerie', 'topless sunbathing']) {
      assert.equal(isExplicitText(text), true, text)
    }
    assert.equal(isExplicitText('Erotic Photography'), true)
    assert.equal(isExplicitText('porn'), true)
    assert.equal(isExplicitText('nudity in art'), true)
    assert.equal(isExplicitText('pornographic content'), true)
    assert.equal(isExplicitText('erotica'), true)
  })

  it('matches whole words only', () => {
    assert.equal(isExplicitText('nudelibrary'), false)
    assert.equal(isExplicitText('denude'), false)
    assert.equal(isExplicitText('sussex'), false)
    assert.equal(isExplicitText('essex coast'), false)
  })

  it('lets ordinary text pass', () => {
    assert.equal(isExplicitText(''), false)
    assert.equal(isExplicitText('city skyline night'), false)
    assert.equal(isExplicitText('woman walking'), false)
  })
})

describe('the safety settings together', () => {
  const both = { skipExplicit: true, avoidPeople: true }
  const neither = { skipExplicit: false, avoidPeople: false }

  it('blocks only an explicit query, and only when Skip explicit is on', () => {
    assert.equal(isQueryBlocked('nude beach', { skipExplicit: true, avoidPeople: false }), true)
    assert.equal(isQueryBlocked('nude beach', { skipExplicit: false, avoidPeople: true }), false)
    assert.equal(isQueryBlocked('woman walking', both), false, 'people are hidden in results')
  })

  it('hides a result by the setting that applies to it', () => {
    assert.equal(isHiddenBySafety('woman walking', both), true)
    assert.equal(
      isHiddenBySafety('woman walking', { skipExplicit: true, avoidPeople: false }),
      false
    )
    assert.equal(isHiddenBySafety('nude statue', both), true)
    assert.equal(isHiddenBySafety('nude statue', { skipExplicit: false, avoidPeople: true }), false)
    assert.equal(isHiddenBySafety('woman walking', neither), false)
  })

  it('keeps the order of the results it lets through, and counts the others', () => {
    const items = [
      { id: 1, about: 'quiet street' },
      { id: 2, about: 'woman walking' },
      { id: 3, about: 'rain on a window' },
      { id: 4, about: 'children playing' }
    ]

    const { shown, filtered } = applySafetyFilters(items, (item) => item.about, both)

    assert.deepEqual(
      shown.map((item) => item.id),
      [1, 3]
    )
    assert.equal(filtered, 2)
    assert.deepEqual(
      applySafetyFilters(items, (item) => item.about, neither),
      {
        shown: items,
        filtered: 0
      }
    )
    assert.deepEqual(
      applySafetyFilters([], (item: string) => item, both),
      {
        shown: [],
        filtered: 0
      }
    )
  })

  it('tells the model how many results were hidden, and what to do when all were', () => {
    assert.deepEqual(safetyFilterReport(0, 5), {})
    assert.deepEqual(safetyFilterReport(0, 0), {}, 'a search with no results is not a hidden one')
    assert.deepEqual(safetyFilterReport(2, 3), { filtered: 2 })
    assert.deepEqual(safetyFilterReport(4, 0), { filtered: 4, note: ALL_RESULTS_HIDDEN_NOTE })
    assert.equal(
      ALL_RESULTS_HIDDEN_NOTE,
      'All results were hidden by the safety settings. Search for objects or places instead.'
    )
  })
})
