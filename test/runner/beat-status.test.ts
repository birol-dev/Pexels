import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  readJob,
  resetNetworkState,
  searchVideos,
  select
} from '../support/run-job.ts'
import { downloadedBeat, emptyBeat, writeSavedJob } from '../support/saved-job.ts'

describe('runner: the status a beat shows while it is searched', () => {
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

  it('does not call a beat searching when it already has a downloaded asset', async () => {
    // Beat 1 has its clip. The model looks for another one while it finds footage for beat 2.
    const clip = video(102, 'city-traffic')
    network.pexels.videos('city traffic', [clip])
    network.llm
      .tools([searchVideos('beat_1', 'city street'), searchVideos('beat_2', 'city traffic')])
      .tools([
        select([
          {
            beatId: 'beat_2',
            assetType: 'video',
            pexelsId: 102,
            variantUrl: videoFileUrl(clip, 'hd')
          }
        ])
      ])
    await applyTestSettings()
    const saved = await writeSavedJob({
      status: 'paused',
      beats: [downloadedBeat('beat_1'), emptyBeat('beat_2')]
    })

    await invokeIpc('jobs:resume', saved.jobId)

    assert.deepEqual(network.problems, [])
    const { summary, manifest } = await readJob(saved.jobId)
    assert.equal(summary.status, 'completed')
    assert.deepEqual(
      manifest.beats.map((beat) => beat.status),
      ['completed', 'completed']
    )
    assert.deepEqual(manifest.beats[0].searchQueries, ['city street'])
  })

  it('still shows a beat with no asset as searching after a search', async () => {
    network.llm
      .tools([searchVideos('beat_1', 'city traffic')])
      .text('Nothing fits.')
      .text('Nothing fits.')
      .text('Nothing fits.')
      .text('Nothing fits.')
    await applyTestSettings()
    const saved = await writeSavedJob({ status: 'paused', beats: [emptyBeat('beat_1')] })

    await invokeIpc('jobs:resume', saved.jobId)

    const { manifest } = await readJob(saved.jobId)
    assert.equal(manifest.beats[0].status, 'searching')
  })
})
