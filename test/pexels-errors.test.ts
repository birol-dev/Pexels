import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../src/main/services/http/api-errors.ts'
import {
  PEXELS_KEY_MISSING_MESSAGE,
  isUnrecoverablePexelsError
} from '../src/main/services/pexels/pexels-errors.ts'

describe('isUnrecoverablePexelsError', () => {
  it('holds for a missing key and for Pexels refusing the key', () => {
    assert.equal(
      isUnrecoverablePexelsError(new ApiError(PEXELS_KEY_MISSING_MESSAGE, 'permanent')),
      true
    )
    assert.equal(isUnrecoverablePexelsError(new ApiError('HTTP 401', 'permanent', 401)), true)
    assert.equal(isUnrecoverablePexelsError(new ApiError('HTTP 403', 'permanent', 403)), true)
  })

  it('does not hold for a failure another query can get past', () => {
    assert.equal(isUnrecoverablePexelsError(new ApiError('HTTP 404', 'permanent', 404)), false)
    assert.equal(isUnrecoverablePexelsError(new ApiError('HTTP 429', 'transient', 429)), false)
    assert.equal(isUnrecoverablePexelsError(new ApiError('HTTP 500', 'transient', 500)), false)
    assert.equal(isUnrecoverablePexelsError(new Error('HTTP 401')), false)
    assert.equal(isUnrecoverablePexelsError('HTTP 401'), false)
  })
})
