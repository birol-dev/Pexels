import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { LlmRateLimiter } from '../src/main/services/llm/llm-rate-limiter.ts'

describe('LlmRateLimiter', () => {
  beforeEach(() => {
    LlmRateLimiter.clear()
  })

  afterEach(() => {
    LlmRateLimiter.clear()
  })

  it('allows immediate requests when RPM limit is 0 (unlimited)', async () => {
    const start = Date.now()
    for (let i = 0; i < 5; i++) {
      await LlmRateLimiter.waitForSlot(undefined, 0)
    }
    const elapsed = Date.now() - start
    assert.ok(elapsed < 100, `Expected instant execution, took ${elapsed}ms`)
  })

  it('allows requests within capacity without waiting', async () => {
    const start = Date.now()
    const rpm = 5
    for (let i = 0; i < rpm; i++) {
      await LlmRateLimiter.waitForSlot(undefined, rpm)
    }
    const elapsed = Date.now() - start
    assert.ok(elapsed < 100, `Expected instant execution for ${rpm} calls, took ${elapsed}ms`)
  })

  it('honors custom limit overrides and clear()', async () => {
    LlmRateLimiter.setCustomLimit(10)
    const limit = await LlmRateLimiter.getActiveLimit()
    assert.equal(limit, 10)

    LlmRateLimiter.clear()
    const limitAfterClear = await LlmRateLimiter.getActiveLimit()
    assert.equal(limitAfterClear, 0)
  })

  it('immediately rejects if abort signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      async () => {
        await LlmRateLimiter.waitForSlot(controller.signal, 10)
      },
      (err: Error) => {
        assert.ok(err.message.includes('aborted'))
        return true
      }
    )
  })

  it('rejects and cleans up when aborted during rate limit wait', async () => {
    const controller = new AbortController()
    // Fill up 1 slot with 60s window
    await LlmRateLimiter.waitForSlot(undefined, 1)

    // Second call will need to wait ~60s, but we abort it after 50ms
    const timer = setTimeout(() => {
      controller.abort()
    }, 50)

    const start = Date.now()
    await assert.rejects(
      async () => {
        await LlmRateLimiter.waitForSlot(controller.signal, 1, () => {})
      },
      (err: Error) => {
        clearTimeout(timer)
        assert.ok(err.message.includes('aborted'))
        return true
      }
    )
    const elapsed = Date.now() - start
    assert.ok(elapsed < 1000, `Should have aborted quickly, took ${elapsed}ms`)
  })
})
