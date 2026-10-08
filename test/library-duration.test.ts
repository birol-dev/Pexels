import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDuration } from '../src/renderer/src/features/library/utils.ts'

describe('Library duration', () => {
  it('shows seconds as m:ss', () => {
    assert.equal(formatDuration(5), '0:05')
    assert.equal(formatDuration(59), '0:59')
    assert.equal(formatDuration(60), '1:00')
    assert.equal(formatDuration(75), '1:15')
    assert.equal(formatDuration(600), '10:00')
  })

  it('rounds fractional seconds to the nearest second', () => {
    assert.equal(formatDuration(12.4), '0:12')
    assert.equal(formatDuration(12.6), '0:13')
    // 59.6 rounds up to a whole minute instead of reading 0:60.
    assert.equal(formatDuration(59.6), '1:00')
  })

  it('shows nothing when there is no usable duration', () => {
    assert.equal(formatDuration(undefined), '')
    assert.equal(formatDuration(0), '')
    assert.equal(formatDuration(-3), '')
    assert.equal(formatDuration(Number.NaN), '')
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), '')
  })
})
