import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  describeUpdateUnavailable,
  shouldRunScheduledCheck,
  shouldShowUpdateBanner,
  summarizeUpdateError,
  updateReadyMessage,
  updateUnavailableReason
} from '../src/shared/update-policy.ts'

describe('Where updates are available', () => {
  it('is off in development, where there is no release feed', () => {
    assert.equal(updateUnavailableReason({ isPackaged: false, platform: 'win32' }), 'development')
    assert.equal(updateUnavailableReason({ isPackaged: false, platform: 'darwin' }), 'development')
  })

  it('is off on macOS, because the builds are unsigned', () => {
    assert.equal(
      updateUnavailableReason({ isPackaged: true, platform: 'darwin' }),
      'macos-unsigned'
    )
  })

  it('is on for packaged Windows and Linux builds', () => {
    assert.equal(updateUnavailableReason({ isPackaged: true, platform: 'win32' }), null)
    assert.equal(updateUnavailableReason({ isPackaged: true, platform: 'linux' }), null)
  })

  it('explains each reason in a sentence', () => {
    assert.match(describeUpdateUnavailable('development'), /development/)
    assert.match(describeUpdateUnavailable('macos-unsigned'), /macOS/)
  })
})

describe('Scheduled update checks', () => {
  it('checks six hours apart, after a short delay at launch', () => {
    assert.equal(UPDATE_CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000)
    assert.ok(UPDATE_FIRST_CHECK_DELAY_MS > 0 && UPDATE_FIRST_CHECK_DELAY_MS < 60_000)
  })

  it('runs when enabled, idle and nothing is waiting to install', () => {
    assert.equal(
      shouldRunScheduledCheck({ enabled: true, checking: false, readyVersion: null }),
      true
    )
  })

  it('skips when the user turned checks off', () => {
    assert.equal(
      shouldRunScheduledCheck({ enabled: false, checking: false, readyVersion: null }),
      false
    )
  })

  it('skips while another check is running', () => {
    assert.equal(
      shouldRunScheduledCheck({ enabled: true, checking: true, readyVersion: null }),
      false
    )
  })

  it('skips once an update is downloaded, because nothing newer can install before the restart', () => {
    assert.equal(
      shouldRunScheduledCheck({ enabled: true, checking: false, readyVersion: '1.4.0' }),
      false
    )
  })
})

describe('Update banner', () => {
  it('shows for a downloaded update when no job is running', () => {
    assert.equal(shouldShowUpdateBanner({ readyVersion: '1.4.0', jobRunning: false }), true)
  })

  it('never shows while a job is running', () => {
    assert.equal(shouldShowUpdateBanner({ readyVersion: '1.4.0', jobRunning: true }), false)
  })

  it('does not show without a downloaded update', () => {
    assert.equal(shouldShowUpdateBanner({ readyVersion: null, jobRunning: false }), false)
  })

  it('reads as the product copy', () => {
    assert.equal(updateReadyMessage('1.4.0'), 'Version 1.4.0 is ready. Restart to update.')
  })
})

describe('Update error summary', () => {
  it('keeps only the first line of a long error', () => {
    const err = new Error('HTTP 404\nheaders: {"server":"github"}\nbody: not found')
    assert.equal(summarizeUpdateError(err), 'HTTP 404')
  })

  it('accepts values that are not errors', () => {
    assert.equal(summarizeUpdateError('offline'), 'offline')
    assert.equal(summarizeUpdateError(undefined), 'undefined')
  })

  it('never returns an empty message', () => {
    assert.equal(summarizeUpdateError(new Error('   ')), 'unknown error')
  })

  it('cuts very long lines', () => {
    const summary = summarizeUpdateError(new Error('x'.repeat(500)))
    assert.equal(summary.length, 160)
    assert.ok(summary.endsWith('...'))
  })
})
