import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  USER_REJECTION_REASON,
  isAssetRejectedByUser
} from '../src/main/services/agent/tool-schemas.ts'

describe('isAssetRejectedByUser', () => {
  const beat = {
    rejectedAssets: [
      { type: 'video', pexelsId: 11, reason: USER_REJECTION_REASON },
      { type: 'photo', pexelsId: 22, reason: 'off topic' }
    ]
  }

  it('is true for an asset the user rejected on this beat', () => {
    assert.equal(isAssetRejectedByUser(beat, 'video', 11), true)
  })

  it('does not block assets the model rejected itself', () => {
    // The model may legitimately change its mind about its own rejections.
    assert.equal(isAssetRejectedByUser(beat, 'photo', 22), false)
  })

  it('matches on type as well as id', () => {
    assert.equal(isAssetRejectedByUser(beat, 'photo', 11), false)
  })

  it('is false for assets that were never rejected', () => {
    assert.equal(isAssetRejectedByUser(beat, 'video', 999), false)
  })

  it('handles beats with no rejection list', () => {
    assert.equal(isAssetRejectedByUser({}, 'video', 11), false)
    assert.equal(isAssetRejectedByUser({ rejectedAssets: [] }, 'video', 11), false)
  })

  it('is scoped to the beat it is called with', () => {
    const otherBeat = { rejectedAssets: [] }
    assert.equal(isAssetRejectedByUser(otherBeat, 'video', 11), false)
  })

  it('keeps recognising rejections already saved in existing manifests', () => {
    // Persisted manifests store this exact string, so changing it would silently
    // un-reject assets for every resumed or rerun project.
    assert.equal(USER_REJECTION_REASON, 'Rejected by user')
  })
})
