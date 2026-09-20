import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OPENROUTER_CACHE_CONTROL,
  applyOpenRouterPromptCache,
  clipOpenRouterSessionId
} from '../src/main/services/llm/openrouter-cache.ts'

describe('applyOpenRouterPromptCache', () => {
  it('always sets an ephemeral cache breakpoint', () => {
    const payload: Record<string, unknown> = { model: 'deepseek/deepseek-v4.1-flash:floor' }
    applyOpenRouterPromptCache(payload)
    assert.deepEqual(payload.cache_control, OPENROUTER_CACHE_CONTROL)
    assert.equal(payload.session_id, undefined)
  })

  it('clips session ids to 256 characters and mirrors prompt_cache_key', () => {
    const payload: Record<string, unknown> = {}
    const sessionId = `stockfinder:${'x'.repeat(300)}`
    applyOpenRouterPromptCache(payload, sessionId)
    assert.equal(typeof payload.session_id, 'string')
    assert.equal(String(payload.session_id).length, 256)
    assert.equal(payload.session_id, payload.prompt_cache_key)
    assert.equal(clipOpenRouterSessionId('  abc  '), 'abc')
  })
})
