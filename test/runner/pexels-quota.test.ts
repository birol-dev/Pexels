import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import {
  resetNetworkState,
  runJob,
  searchVideos,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

describe('runner: the Pexels quota is exhausted', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('pauses the job, says when the quota resets, and stops calling Pexels', async () => {
    const fiveDays = 5 * 24 * 60 * 60
    network.pexels.quota = {
      limit: 20000,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + fiveDays
    }
    network.pexels.failNextSearch(429)
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])

    // A search that backed off or waited on the reset would run into the deadline.
    const run = await runJob({ script: ONE_BEAT_SCRIPT }, {}, { deadlineMs: 2000 })

    assert.equal(run.snapshot.status, 'paused')
    assert.equal(network.pexelsRequests().length, 1, 'no Pexels request after the 429')
    const logged = run.snapshot.logs.map((entry) => entry.message).join('\n')
    assert.match(logged, /Pexels API quota is exhausted/)
    assert.match(logged, /It resets /)
  })

  it('pauses before the next search once an answer spent the last request, and again on resume', async () => {
    network.pexels.quota = {
      limit: 20000,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60
    }
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      // This search is answered, with headers that say nothing is left.
      .tools([searchVideos('beat_1', 'city street')])
      .tools([searchVideos('beat_1', 'busy road')])

    const run = await runJob({ script: ONE_BEAT_SCRIPT }, {}, { deadlineMs: 2000 })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'paused')
    assert.equal(run.summary.status, 'paused')
    assert.equal(network.pexelsRequests().length, 1, 'the second search was never sent')
    const refused = run.snapshot.logs.findLast((entry) => entry.type === 'tool_result')
    assert.deepEqual(Object.keys(refused?.data as object), ['error', 'retryable'])
    assert.match((refused?.data as { error: string }).error, /^pexels_rate_limited: /)
    assert.equal((refused?.data as { retryable: boolean }).retryable, false)

    // Nothing has reset, so a resume must stop at the same place without calling Pexels.
    network.llm.tools([searchVideos('beat_1', 'night traffic')])
    await withDeadline(run.runner, run.runner.resume(), 2000)

    assert.deepEqual(network.problems, [])
    assert.equal(run.runner.getSnapshot().status, 'paused')
    assert.equal(network.pexelsRequests().length, 1)
  })
})
