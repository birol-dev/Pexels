import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { resetNetworkState, runJob } from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

const TOKEN_CAP_ERROR =
  'max_tokens is too large: 32768. This model supports at most 16384 completion tokens, whereas you provided 32768.'

describe('runner: the model caps output below what the app asks for', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('retries the first call once with the stated cap and completes the job', async () => {
    network.llm.error(400, TOKEN_CAP_ERROR)
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    // One rejected request, then the three a one-beat job needs, all at the learned cap.
    assert.deepEqual(
      network.llmRequests().map((request) => request.max_completion_tokens),
      [32768, 16384, 16384, 16384]
    )
  })
})
