import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_REQUEST_TIMEOUT_SECONDS,
  MAX_REQUEST_TIMEOUT_SECONDS,
  MIN_LLM_REQUEST_TIMEOUT_SECONDS,
  resolveLlmRequestTimeoutSeconds
} from '../src/main/services/llm/llm-timeout.ts'

describe('resolveLlmRequestTimeoutSeconds', () => {
  it('floors the saved 60s Settings default so OpenRouter completions can finish', () => {
    assert.equal(DEFAULT_REQUEST_TIMEOUT_SECONDS, 60)
    assert.equal(resolveLlmRequestTimeoutSeconds(60), MIN_LLM_REQUEST_TIMEOUT_SECONDS)
    assert.equal(resolveLlmRequestTimeoutSeconds(undefined), MIN_LLM_REQUEST_TIMEOUT_SECONDS)
    assert.equal(resolveLlmRequestTimeoutSeconds(0), MIN_LLM_REQUEST_TIMEOUT_SECONDS)
  })

  it('keeps an explicit timeout when it is already above the LLM floor', () => {
    assert.equal(resolveLlmRequestTimeoutSeconds(MAX_REQUEST_TIMEOUT_SECONDS), 600)
  })
})
