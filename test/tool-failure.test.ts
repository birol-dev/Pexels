import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describeToolFailure,
  statusAfterInterruptedSearch,
  statusDuringSearch
} from '../src/main/services/agent/tool-schemas.ts'
import { ApiError } from '../src/main/services/http/api-errors.ts'

describe('describeToolFailure', () => {
  it('treats an abort during pause as an interruption, not a failure', () => {
    const failure = describeToolFailure('paused', new ApiError('Request aborted', 'permanent'))

    assert.equal(failure.interrupted, true)
    assert.equal(failure.result.interrupted, true)
    assert.equal('error' in failure.result, false)
    assert.match(String(failure.result.note), /Repeat it/)
  })

  it('treats an abort during cancel as an interruption', () => {
    const failure = describeToolFailure('cancelled', new Error('aborted'))
    assert.equal(failure.interrupted, true)
    assert.match(failure.message, /cancelled/)
  })

  it('does not tell the model an interrupted call is permanently failed', () => {
    const failure = describeToolFailure('paused', new ApiError('Request aborted', 'permanent'))
    assert.notEqual(failure.result.retryable, false)
  })

  it('reports a real failure while running, with its retry hint', () => {
    const failure = describeToolFailure('running', new ApiError('HTTP 503', 'transient', 503))

    assert.equal(failure.interrupted, false)
    assert.equal(failure.message, 'HTTP 503 (retryable)')
    assert.deepEqual(failure.result, { error: 'HTTP 503 (retryable)', retryable: true })
  })

  it('marks permanent API errors as not retryable', () => {
    const failure = describeToolFailure('running', new ApiError('HTTP 404', 'permanent', 404))
    assert.deepEqual(failure.result, { error: 'HTTP 404', retryable: false })
  })

  it('reports plain errors and non-error throws while running', () => {
    assert.deepEqual(describeToolFailure('running', new Error('bad args')).result, {
      error: 'bad args',
      retryable: false
    })
    assert.deepEqual(describeToolFailure('running', 'boom').result, {
      error: 'boom',
      retryable: false
    })
  })
})

describe('statusAfterInterruptedSearch', () => {
  it('returns to pending when the beat has no usable assets', () => {
    assert.equal(statusAfterInterruptedSearch({ assets: [] }), 'pending')
    assert.equal(statusAfterInterruptedSearch({}), 'pending')
    assert.equal(statusAfterInterruptedSearch({ assets: [{ status: 'failed' }] }), 'pending')
  })

  it('restores completed when everything usable already downloaded', () => {
    const beat = { assets: [{ status: 'completed' }, { status: 'failed' }] }
    assert.equal(statusAfterInterruptedSearch(beat), 'completed')
  })

  it('restores downloading while a download is in flight', () => {
    const beat = { assets: [{ status: 'completed' }, { status: 'downloading' }] }
    assert.equal(statusAfterInterruptedSearch(beat), 'downloading')
  })

  it('restores selecting when assets are only selected', () => {
    assert.equal(statusAfterInterruptedSearch({ assets: [{ status: 'pending' }] }), 'selecting')
  })
})

describe('statusDuringSearch', () => {
  it('is searching for a beat with no usable assets', () => {
    assert.equal(statusDuringSearch({ assets: [] }), 'searching')
    assert.equal(statusDuringSearch({}), 'searching')
    assert.equal(statusDuringSearch({ assets: [{ status: 'failed' }] }), 'searching')
  })

  it('keeps the status of a beat that already has an asset', () => {
    assert.equal(statusDuringSearch({ assets: [{ status: 'completed' }] }), 'completed')
    assert.equal(statusDuringSearch({ assets: [{ status: 'downloading' }] }), 'downloading')
    assert.equal(statusDuringSearch({ assets: [{ status: 'pending' }] }), 'selecting')
  })
})
