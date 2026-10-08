import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { resetNetworkState, runJob, searchVideos, submitBeats } from '../support/run-job.ts'
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

  it(
    'pauses the job, says when the quota resets, and stops calling Pexels',
    { todo: 'plan 01 phase 2' },
    async () => {
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

      // Until the fix, the search backs off and then waits on the quota reset, so the
      // run is cancelled at the deadline instead of holding the test process open.
      const run = await runJob({ script: ONE_BEAT_SCRIPT }, {}, { deadlineMs: 2000 })

      assert.equal(run.snapshot.status, 'paused')
      assert.equal(network.pexelsRequests().length, 1, 'no Pexels request after the 429')
      const logged = run.snapshot.logs.map((entry) => entry.message).join('\n')
      assert.match(logged, /Pexels API quota is exhausted/)
      assert.match(logged, /It resets /)
    }
  )
})
