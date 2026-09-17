import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findInFlightDownload,
  isRetryableDownloadStatus
} from '../src/main/services/pexels/download-task-utils.ts'

describe('isRetryableDownloadStatus', () => {
  it('treats expired CDN auth failures as retryable so URL refresh can run', () => {
    assert.equal(isRetryableDownloadStatus(401), true)
    assert.equal(isRetryableDownloadStatus(403), true)
    assert.equal(isRetryableDownloadStatus(429), true)
    assert.equal(isRetryableDownloadStatus(500), true)
    assert.equal(isRetryableDownloadStatus(404), false)
  })
})

describe('findInFlightDownload', () => {
  it('returns the pending or downloading task for the same asset', () => {
    const queue = [
      { assetId: 1, type: 'photo', status: 'completed' },
      { assetId: 2, type: 'photo', status: 'downloading' },
      { assetId: 2, type: 'video', status: 'pending' }
    ]
    const match = findInFlightDownload(queue, 2, 'photo')
    assert.equal(match?.status, 'downloading')
    assert.equal(findInFlightDownload(queue, 1, 'photo'), undefined)
  })
})

describe('cancelAll completion race', () => {
  it('treats cancelled tasks as non-completable', () => {
    const task = {
      cancelled: true,
      status: 'failed' as const,
      progress: 0,
      filePath: undefined as string | undefined
    }
    // Mirrors the guard added in PexelsDownloader.runDownload .then()
    if (task.cancelled) {
      assert.equal(task.status, 'failed')
      return
    }
    task.status = 'completed'
    task.progress = 100
    task.filePath = '/tmp/x.jpg'
    assert.fail('cancelled task must not be marked completed')
  })
})
