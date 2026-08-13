import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError, fetchWithRetry } from '../src/main/services/http/api-errors.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

describe('fetchWithRetry', () => {
  it('does not retry after the caller aborts', async () => {
    const controller = new AbortController()
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      controller.abort()
      throw abortError()
    }

    await assert.rejects(
      () =>
        fetchWithRetry('https://example.com', {
          init: { signal: controller.signal },
          isAborted: () => controller.signal.aborted,
          maxRetries: 3
        }),
      (error: unknown) => error instanceof ApiError && error.kind === 'permanent'
    )
    assert.equal(calls, 1)
  })

  it('interrupts retry backoff when aborted', async () => {
    const controller = new AbortController()
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      setTimeout(() => controller.abort(), 10)
      return {
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'rate limited'
      } as Response
    }

    const started = Date.now()
    await assert.rejects(
      () =>
        fetchWithRetry('https://example.com', {
          init: { signal: controller.signal },
          isAborted: () => controller.signal.aborted,
          maxRetries: 3
        }),
      (error: unknown) => error instanceof ApiError && error.kind === 'permanent'
    )
    assert.equal(calls, 1)
    assert.ok(Date.now() - started < 2000)
  })
})
