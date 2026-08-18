import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  ApiCircuitBreaker,
  ApiError,
  extractErrorMessage,
  fetchWithRetry
} from '../src/main/services/http/api-errors.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

describe('extractErrorMessage', () => {
  it('extracts nested OpenAI/Gemini error messages from JSON', () => {
    const openaiJson = JSON.stringify({
      error: { message: 'Incorrect API key provided: sk-test', type: 'invalid_request_error' }
    })
    assert.equal(extractErrorMessage(openaiJson), 'Incorrect API key provided: sk-test')

    const geminiJson = JSON.stringify({
      error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' }
    })
    assert.equal(extractErrorMessage(geminiJson), 'API key not valid')

    const genericJson = JSON.stringify({ message: 'Rate limit exceeded' })
    assert.equal(extractErrorMessage(genericJson), 'Rate limit exceeded')
  })

  it('handles plain string error bodies gracefully', () => {
    assert.equal(extractErrorMessage('Unauthorized access'), 'Unauthorized access')
    assert.equal(extractErrorMessage(''), '')
  })
})

describe('ApiCircuitBreaker', () => {
  it('opens after threshold failures and resets when reset() is called', () => {
    const circuit = new ApiCircuitBreaker(3, 60_000)
    assert.equal(circuit.isOpen(), false)

    circuit.recordFailure()
    circuit.recordFailure()
    assert.equal(circuit.isOpen(), false)

    circuit.recordFailure()
    assert.equal(circuit.isOpen(), true)
    assert.throws(() => circuit.ensureClosed('TestService'), /too many consecutive failures/)

    circuit.reset()
    assert.equal(circuit.isOpen(), false)
    assert.doesNotThrow(() => circuit.ensureClosed('TestService'))
  })
})

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
