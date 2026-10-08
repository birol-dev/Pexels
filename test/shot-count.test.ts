import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_TOTAL_DOWNLOADS, capForShots, recommendedShotCount } from '../src/shared/shot-count.ts'

const words = (count: number): string => Array.from({ length: count }, () => 'word').join(' ')

describe('recommendedShotCount', () => {
  it('is one shot per 12 words, rounded up', () => {
    assert.equal(recommendedShotCount(words(12)), 1)
    assert.equal(recommendedShotCount(words(13)), 2)
    assert.equal(recommendedShotCount(words(24)), 2)
    assert.equal(recommendedShotCount(words(25)), 3)
    assert.equal(recommendedShotCount(words(450)), 38)
  })

  it('is at least one, even for an empty script', () => {
    assert.equal(recommendedShotCount(''), 1)
    assert.equal(recommendedShotCount('   \n\t '), 1)
    assert.equal(recommendedShotCount(words(1)), 1)
  })

  it('counts words separated by any whitespace, and ignores the edges', () => {
    assert.equal(recommendedShotCount(`  ${words(12)}\n\n${words(1)}  `), 2)
    assert.equal(
      recommendedShotCount('one\ttwo\nthree four five six seven eight nine ten eleven'),
      1
    )
  })
})

describe('capForShots', () => {
  it('is the shot count while the job accepts it', () => {
    assert.equal(capForShots(1), 1)
    assert.equal(capForShots(38), 38)
    assert.equal(capForShots(MAX_TOTAL_DOWNLOADS), MAX_TOTAL_DOWNLOADS)
  })

  it('stops at the most a job accepts', () => {
    assert.equal(MAX_TOTAL_DOWNLOADS, 100)
    assert.equal(capForShots(101), 100)
    assert.equal(capForShots(5000), 100)
  })

  it('is at least one', () => {
    assert.equal(capForShots(0), 1)
    assert.equal(capForShots(-4), 1)
  })
})
