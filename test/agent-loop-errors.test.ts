import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  decideRunFinalize,
  loopErrorToRecord,
  remainingIterations
} from '../src/main/services/agent/tool-schemas.ts'
import { loadAgentConversationState } from '../src/main/services/agent/agent-state.ts'

const base = { hitIterationLimit: false, maxTotalDownloads: 10, maxIterations: 30 }

describe('loop error reporting', () => {
  it('surfaces the real error instead of a tool-calling hint when nothing downloaded', () => {
    const result = decideRunFinalize({
      ...base,
      beats: [{ assets: [] }],
      loopError: 'Invalid API key'
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.reason, 'agent_error')
    assert.match(result.logMessage, /Invalid API key/)
    assert.doesNotMatch(result.logMessage, /tool calling/)
  })

  it('reports the error when beats are incomplete', () => {
    const result = decideRunFinalize({
      ...base,
      beats: [{ assets: [{ status: 'completed' }] }, { assets: [] }],
      loopError: 'Request timed out'
    })
    assert.equal(result.reason, 'agent_error')
  })

  it('still completes when every beat has a download despite a late error', () => {
    const result = decideRunFinalize({
      ...base,
      beats: [{ assets: [{ status: 'completed' }] }],
      loopError: 'Request timed out'
    })
    assert.equal(result.status, 'completed')
  })

  it('keeps the original reasons when there was no loop error', () => {
    const result = decideRunFinalize({ ...base, beats: [{ assets: [] }] })
    assert.equal(result.reason, 'zero_downloads')
  })
})

describe('loopErrorToRecord', () => {
  it('ignores aborts caused by pause or cancel', () => {
    assert.equal(loopErrorToRecord('paused', new Error('aborted')), null)
    assert.equal(loopErrorToRecord('cancelled', new Error('aborted')), null)
  })

  it('records errors while running', () => {
    assert.equal(loopErrorToRecord('running', new Error('boom')), 'boom')
    assert.equal(loopErrorToRecord('running', 'plain'), 'plain')
  })
})

describe('job-wide iteration budget', () => {
  it('shrinks as iterations are used and never goes negative', () => {
    assert.equal(remainingIterations(30, 0), 30)
    assert.equal(remainingIterations(30, 12), 18)
    assert.equal(remainingIterations(30, 30), 0)
    assert.equal(remainingIterations(30, 45), 0)
    assert.equal(remainingIterations(30, -5), 30)
  })

  it('is restored from agent-state.json so resume does not reset it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-state-'))
    try {
      await writeFile(
        join(dir, 'agent-state.json'),
        JSON.stringify({ schemaVersion: 1, messages: [], pexelsCandidates: [], iterationsUsed: 7 })
      )
      const loaded = await loadAgentConversationState(dir, {})
      assert.equal(loaded.iterationsUsed, 7)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('defaults to 0 for old state files or junk values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-state-'))
    try {
      await writeFile(
        join(dir, 'agent-state.json'),
        JSON.stringify({ messages: [], iterationsUsed: 'lots' })
      )
      assert.equal((await loadAgentConversationState(dir, {})).iterationsUsed, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
