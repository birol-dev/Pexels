import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { createTrailingThrottle } from '../src/main/services/agent/progress-throttle.ts'

describe('createTrailingThrottle', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('collapses a burst of updates into a single call', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    for (let i = 0; i < 100; i++) throttle.schedule()
    assert.equal(calls, 0)

    mock.timers.tick(250)
    assert.equal(calls, 1)
  })

  it('does not call before the interval has elapsed', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    mock.timers.tick(249)
    assert.equal(calls, 0)
    mock.timers.tick(1)
    assert.equal(calls, 1)
  })

  it('does not extend the interval when updates keep arriving', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    mock.timers.tick(200)
    throttle.schedule()
    mock.timers.tick(50)
    assert.equal(calls, 1)
  })

  it('schedules again after a call has fired', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    mock.timers.tick(250)
    throttle.schedule()
    mock.timers.tick(250)
    assert.equal(calls, 2)
  })

  it('does not call at all when nothing was scheduled', () => {
    let calls = 0
    createTrailingThrottle(() => calls++, 250)
    mock.timers.tick(1000)
    assert.equal(calls, 0)
  })

  it('cancel drops a pending call', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    throttle.cancel()
    mock.timers.tick(1000)
    assert.equal(calls, 0)
  })

  it('can be scheduled again after a cancel', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    throttle.cancel()
    throttle.schedule()
    mock.timers.tick(250)
    assert.equal(calls, 1)
  })

  it('flush runs the pending call immediately and only once', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.schedule()
    throttle.flush()
    assert.equal(calls, 1)

    mock.timers.tick(1000)
    assert.equal(calls, 1)
  })

  it('flush is a no-op when nothing is pending', () => {
    let calls = 0
    const throttle = createTrailingThrottle(() => calls++, 250)

    throttle.flush()
    assert.equal(calls, 0)
  })
})
