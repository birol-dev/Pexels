import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

interface JobEvent {
  type: string
  data: Record<string, unknown>
}

describe('runner: snapshot events', () => {
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

  it('leave the logs out, and jobs:get still returns them', async () => {
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
    // Approval mode pauses the job, so its runner stays in memory for jobs:get.
    const run = await runJob({ script: ONE_BEAT_SCRIPT }, { requireApprovalBeforeDownload: true })
    const events = run.events as JobEvent[]

    const snapshots = events.filter((event) => event.type === 'snapshot')
    assert.ok(snapshots.length > 0, 'the run sent snapshot events')
    for (const snapshot of snapshots) {
      assert.equal('logs' in snapshot.data, false, 'a snapshot event has no logs')
      assert.equal(snapshot.data.jobId, run.jobId)
      assert.ok(Array.isArray(snapshot.data.beats), 'the rest of the job state is there')
    }
    assert.equal(snapshots.at(-1)?.data.status, 'paused')
    assert.equal((snapshots.at(-1)?.data.usage as { totalTokens: number }).totalTokens, 3 * 120)

    // Each entry reached the renderer as its own event, so nothing is lost.
    const logged = events.filter((event) => event.type === 'log').map((event) => event.data)
    assert.ok(logged.length > 0)
    const live = (await invokeIpc('jobs:get', run.jobId)) as { logs: unknown[] }
    assert.deepEqual(live.logs, logged)

    // Once the job has ended, jobs:get reads the logs from the project folder.
    await withDeadline(run.runner, run.runner.approveAndResume({}))
    assert.equal(AgentRunner.getActive(run.jobId), undefined)
    const stored = (await invokeIpc('jobs:get', run.jobId)) as { status: string; logs: unknown[] }
    assert.equal(stored.status, 'completed')
    assert.ok(stored.logs.length > 0, 'the saved job still has its logs')
    assert.deepEqual(network.problems, [])
  })
})
