import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { registerAssetsHandlers } from '../../src/main/ipc/assets.ipc.ts'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { calls, invokeIpc, shell } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { holdMediaDownload, holdVideoSearch, until } from '../support/gates.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  nextJobId,
  readJob,
  resetNetworkState,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

interface ListedAsset {
  id: string
  status: string
  error?: string
  filePath?: string
  beatId: string
}

describe('the library of a job that has a runner', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
    registerAssetsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
    calls.trashed.length = 0
  })

  afterEach(() => {
    network.restore()
    mock.restoreAll()
  })

  /**
   * A job paused by the user in the middle of a turn, after its first clip finished
   * downloading. Its runner is alive and holds the job in memory. Resuming it finds a second
   * clip for the beat, because the first one gets deleted.
   */
  async function pausedJobWithDownloadedClip(): Promise<{
    runner: AgentRunner
    jobId: string
    events: Array<{ type: string }>
    filePath: string
    assetId: string
    /** Lets the paused turn end, resumes the job and waits for it to finish. */
    finish: () => Promise<void>
    /** Cancels the job and lets the paused turn end, so no request is left waiting. */
    discard: () => Promise<void>
  }> {
    const first = video(101, 'city-street')
    const second = video(103, 'night-road')
    network.pexels.videos('city street', [first]).videos('night traffic', [second])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(first, 'hd')
          }
        ]),
        searchVideos('beat_1', 'busy road')
      ])
      // After the resume: the deleted clip leaves the beat without footage.
      .tools([searchVideos('beat_1', 'night traffic')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 103,
            variantUrl: videoFileUrl(second, 'hd')
          }
        ])
      ])

    await applyTestSettings()
    const runner = new AgentRunner(nextJobId(), {
      title: 'Test job',
      script: ONE_BEAT_SCRIPT,
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 10
    })
    const events: Array<{ type: string }> = []
    runner.on('event', (event) => events.push(event))
    const search = holdVideoSearch('busy road')
    await runner.ensureRegistered()
    const run = runner.start()
    await search.reached
    const asset = (): { id: string; status: string; filePath?: string } =>
      runner.getSnapshot().beats[0].assets[0]
    await until(() => asset().status === 'completed')
    await runner.pause()
    assert.equal(runner.getSnapshot().status, 'paused')

    return {
      runner,
      jobId: runner.getSnapshot().jobId,
      events,
      filePath: asset().filePath!,
      assetId: asset().id,
      finish: async () => {
        search.release()
        await withDeadline(runner, run)
        await withDeadline(runner, runner.resume())
      },
      discard: async () => {
        await runner.cancel()
        search.release()
        await withDeadline(runner, run)
      }
    }
  }

  async function manifestAsset(jobId: string, assetId: string): Promise<ListedAsset> {
    const { manifest } = await readJob(jobId)
    return manifest.beats.flatMap((b) => b.assets).find((a) => a.id === assetId) as ListedAsset
  }

  describe('assets:deleteLocal', () => {
    it('is not undone by the runner, which writes the job again when it resumes', async () => {
      const job = await pausedJobWithDownloadedClip()
      assert.equal(AgentRunner.getActive(job.jobId), job.runner)
      assert.ok(existsSync(job.filePath))

      await invokeIpc('assets:deleteLocal', job.jobId, job.assetId)

      // The runner has written it already, not just the registry.
      assert.deepEqual(calls.trashed, [job.filePath])
      assert.ok(!existsSync(job.filePath))
      const deleted = await manifestAsset(job.jobId, job.assetId)
      assert.equal(deleted.status, 'failed')
      assert.equal(deleted.error, 'Deleted by user')
      assert.equal(deleted.filePath, undefined)
      assert.equal((await readJob(job.jobId)).summary.assetCount, 0)
      assert.equal(job.runner.getSnapshot().downloadedCount, 0)
      assert.ok(
        job.events.some((event) => event.type === 'beats'),
        'the open screen is told'
      )

      await job.finish()

      // The runner went on from what it held in memory, and the deletion is still there.
      assert.deepEqual(network.problems, [])
      const { summary, manifest } = await readJob(job.jobId)
      assert.equal(summary.status, 'completed')
      const assets = manifest.beats[0].assets as unknown as ListedAsset[]
      assert.deepEqual(
        assets.map((a) => [a.id, a.status]),
        [
          ['video_101', 'failed'],
          ['video_103', 'completed']
        ]
      )
      assert.equal(assets[0].error, 'Deleted by user')
      assert.equal(assets[0].filePath, undefined)
      assert.ok(assets[1].filePath && existsSync(assets[1].filePath))
      assert.equal(summary.assetCount, 1)
    })

    it('fails and keeps the file and the record when the trash is unavailable', async () => {
      const job = await pausedJobWithDownloadedClip()
      mock.method(shell, 'trashItem', async () => {
        throw new Error('The trash is not available')
      })

      await assert.rejects(
        invokeIpc('assets:deleteLocal', job.jobId, job.assetId),
        /The trash is not available/
      )

      assert.ok(existsSync(job.filePath), 'the file was not deleted for good')
      assert.equal(job.runner.getSnapshot().beats[0].assets[0].status, 'completed')
      assert.equal(job.runner.getSnapshot().beats[0].assets[0].filePath, job.filePath)
      await job.discard()
    })

    it('treats a file that is already gone as deleted, without asking the trash', async () => {
      const job = await pausedJobWithDownloadedClip()
      await rm(job.filePath)

      await invokeIpc('assets:deleteLocal', job.jobId, job.assetId)

      assert.deepEqual(calls.trashed, [])
      const deleted = await manifestAsset(job.jobId, job.assetId)
      assert.equal(deleted.status, 'failed')
      assert.equal(deleted.error, 'Deleted by user')
      await job.discard()
    })

    it('refuses to delete a clip that is still downloading', async () => {
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
      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), {
        title: 'Test job',
        script: ONE_BEAT_SCRIPT,
        platform: 'YouTube',
        style: 'cinematic',
        mix: 'videos + photos',
        maxAssetsPerBeat: 1,
        maxTotalDownloads: 10
      })
      const download = holdMediaDownload()
      await runner.ensureRegistered()
      const run = runner.start()
      await download.reached
      await until(() => runner.getSnapshot().beats[0]?.assets[0]?.status === 'downloading')

      await assert.rejects(
        invokeIpc('assets:deleteLocal', runner.getSnapshot().jobId, 'video_101'),
        /Wait for this download to finish/
      )
      assert.equal(runner.getSnapshot().beats[0].assets[0].status, 'downloading')

      download.release()
      await withDeadline(runner, run)
      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(runner.getSnapshot().beats[0].assets[0].status, 'completed')
    })
  })

  describe('assets:list', () => {
    it('lists what the runner holds, and a file found missing stays missing', async () => {
      const job = await pausedJobWithDownloadedClip()
      await rm(job.filePath)

      const listed = (await invokeIpc('assets:list', job.jobId)) as ListedAsset[]

      assert.equal(listed.length, 1)
      assert.equal(listed[0].id, job.assetId)
      assert.equal(listed[0].beatId, 'beat_1')
      assert.equal(listed[0].status, 'failed')
      assert.equal(listed[0].error, 'File not found on disk')
      assert.equal(listed[0].filePath, undefined)
      assert.equal(job.runner.getSnapshot().beats[0].assets[0].status, 'failed')
      assert.equal(job.runner.getSnapshot().downloadedCount, 0)
      assert.equal((await manifestAsset(job.jobId, job.assetId)).status, 'failed')

      await job.finish()

      // The runner's own writes keep the correction instead of restoring the old record.
      assert.deepEqual(network.problems, [])
      const assets = (await readJob(job.jobId)).manifest.beats[0].assets as unknown as ListedAsset[]
      assert.deepEqual(
        assets.map((a) => [a.id, a.status]),
        [
          ['video_101', 'failed'],
          ['video_103', 'completed']
        ]
      )
      assert.equal(assets[0].error, 'File not found on disk')
    })

    it('writes nothing when every file is there', async () => {
      const job = await pausedJobWithDownloadedClip()
      const before = await readJob(job.jobId)

      const listed = (await invokeIpc('assets:list', job.jobId)) as ListedAsset[]

      assert.equal(listed[0].status, 'completed')
      assert.equal(listed[0].filePath, job.filePath)
      assert.equal(
        (await readJob(job.jobId)).summary.updatedAt,
        before.summary.updatedAt,
        'the registry was not touched'
      )
      await job.discard()
    })
  })
})
