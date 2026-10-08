import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  readJob,
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

describe('jobs IPC guards', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('approving a completed job does not restart it', { todo: 'plan 01 phase 3' }, async () => {
    scriptOneBeatJob(network)
    const run = await runJob({ script: ONE_BEAT_SCRIPT })
    assert.equal(run.summary.status, 'completed')
    const requestsBefore = network.requests.length

    await invokeIpc('jobs:approveAndResume', run.jobId, {})

    const after = await readJob(run.jobId)
    assert.equal(AgentRunner.getActive(run.jobId), undefined, 'no runner was created')
    assert.equal(after.summary.status, 'completed')
    assert.equal(after.summary.updatedAt, run.summary.updatedAt, 'the job was not touched')
    assert.equal(network.requests.length, requestsBefore)
  })

  it(
    'cancelling a job that waits for approval drops its runner',
    { todo: 'plan 01 phase 3' },
    async () => {
      const clip = video(101, 'city-street')
      network.pexels.videos('city street', [clip])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchVideos('beat_1', 'city street')])
        .tools([
          select([
            {
              beatId: 'beat_1',
              assetType: 'video',
              pexelsId: 101,
              variantUrl: videoFileUrl(clip, 'hd')
            }
          ])
        ])
      const run = await runJob({ script: ONE_BEAT_SCRIPT }, { requireApprovalBeforeDownload: true })
      assert.equal(run.snapshot.status, 'paused')
      assert.ok(AgentRunner.getActive(run.jobId), 'a paused runner stays registered')

      await invokeIpc('jobs:cancel', run.jobId)

      assert.equal((await readJob(run.jobId)).summary.status, 'cancelled')
      assert.equal(AgentRunner.getActive(run.jobId), undefined)
    }
  )
})
