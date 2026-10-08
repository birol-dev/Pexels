import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  readJob,
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'

describe('runner: approval before download', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it(
    'processes every select call of a turn, pauses once, and finishes after approval',
    { todo: 'plan 04 phase 4' },
    async () => {
      const clips = [video(101, 'city'), video(102, 'forest'), video(103, 'ocean')]
      const queries = ['city street', 'forest path', 'ocean waves']
      clips.forEach((clip, index) => network.pexels.videos(queries[index], [clip]))

      network.llm
        .tools([submitBeats(['First sentence.', 'Second sentence.', 'Third sentence.'])])
        .tools(queries.map((query, index) => searchVideos(`beat_${index + 1}`, query)))
        // One select call per beat, which is what models often send.
        .tools(
          clips.map((clip, index) =>
            select([
              {
                beatId: `beat_${index + 1}`,
                assetType: 'video',
                pexelsId: clip.id,
                variantUrl: videoFileUrl(clip, 'hd')
              }
            ])
          )
        )

      const run = await runJob(
        { script: 'First sentence. Second sentence. Third sentence.' },
        { requireApprovalBeforeDownload: true }
      )

      assert.equal(run.snapshot.status, 'paused')
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.status)),
        [['pending'], ['pending'], ['pending']],
        'all three selections were recorded before the pause'
      )
      assert.equal(network.mediaRequests().length, 0, 'nothing downloads before approval')

      await withDeadline(run.runner, run.runner.approveAndResume({}))

      const { summary, manifest } = await readJob(run.jobId)
      assert.deepEqual(network.problems, [])
      assert.equal(summary.status, 'completed')
      assert.equal(network.mediaRequests().length, 3)
      assert.equal(network.llmRequests().length, 3, 'approval needs no further model turn')
      assert.ok(manifest.beats.every((beat) => beat.status === 'completed'))
    }
  )
})
