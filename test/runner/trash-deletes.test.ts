import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { registerAssetsHandlers } from '../../src/main/ipc/assets.ipc.ts'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { calls, invokeIpc, shell } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { readJob, resetNetworkState, runJob, type JobRun } from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

describe('deleting from the app', () => {
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

  /** A finished job with one downloaded clip, and where that clip is on disk. */
  async function finishedJob(): Promise<{ run: JobRun; assetId: string; filePath: string }> {
    scriptOneBeatJob(network)
    const run = await runJob({ script: ONE_BEAT_SCRIPT })
    const [asset] = run.manifest.beats[0].assets
    assert.ok(asset.filePath && existsSync(asset.filePath), 'the clip was downloaded')
    return { run, assetId: asset.id, filePath: asset.filePath }
  }

  function makeTrashUnavailable(): void {
    mock.method(shell, 'trashItem', async () => {
      throw new Error('The trash is not available')
    })
    // The handler reports the failure on the console as well as to the caller.
    mock.method(console, 'error', () => {})
  }

  describe('assets:deleteLocal', () => {
    it('moves the file to the trash and marks the asset as deleted', async () => {
      const { run, assetId, filePath } = await finishedJob()

      await invokeIpc('assets:deleteLocal', run.jobId, assetId)

      assert.deepEqual(calls.trashed, [filePath])
      const { summary, manifest } = await readJob(run.jobId)
      const [asset] = manifest.beats[0].assets
      assert.equal(asset.status, 'failed')
      assert.equal(asset.error, 'Deleted by user')
      assert.equal(asset.filePath, undefined)
      assert.equal(summary.assetCount, 0)
    })

    it('fails and keeps the file when the trash is unavailable', async () => {
      const { run, assetId, filePath } = await finishedJob()
      makeTrashUnavailable()

      await assert.rejects(
        invokeIpc('assets:deleteLocal', run.jobId, assetId),
        /The trash is not available/
      )

      assert.ok(existsSync(filePath), 'the file was not deleted for good')
      const { summary, manifest } = await readJob(run.jobId)
      const [asset] = manifest.beats[0].assets
      assert.equal(asset.status, 'completed')
      assert.equal(asset.filePath, filePath)
      assert.equal(summary.assetCount, 1)
    })

    it('treats a file that is already gone as deleted, without asking the trash', async () => {
      const { run, assetId, filePath } = await finishedJob()
      await rm(filePath)

      await invokeIpc('assets:deleteLocal', run.jobId, assetId)

      assert.deepEqual(calls.trashed, [])
      const [asset] = (await readJob(run.jobId)).manifest.beats[0].assets
      assert.equal(asset.status, 'failed')
      assert.equal(asset.error, 'Deleted by user')
    })
  })

  describe('jobs:delete', () => {
    it('moves the project folder to the trash and forgets the job', async () => {
      const { run } = await finishedJob()
      const projectDir = run.summary.downloadPath

      await invokeIpc('jobs:delete', run.jobId)

      assert.deepEqual(calls.trashed, [projectDir])
      assert.equal(await ProjectStore.get(run.jobId), undefined)
    })

    it('fails with a message and keeps the job when the trash is unavailable', async () => {
      const { run, filePath } = await finishedJob()
      const projectDir = run.summary.downloadPath
      makeTrashUnavailable()

      await assert.rejects(invokeIpc('jobs:delete', run.jobId), (error: Error) => {
        assert.match(error.message, /^Could not move the project folder to the trash/)
        assert.ok(error.message.includes(projectDir), 'the message names the folder')
        assert.match(error.message, /The trash is not available$/)
        return true
      })

      assert.ok(existsSync(filePath), 'the files were not deleted for good')
      assert.ok(await ProjectStore.get(run.jobId), 'the job is still listed, so it can be retried')
    })

    it('forgets a job whose folder is already gone', async () => {
      const { run } = await finishedJob()
      await rm(run.summary.downloadPath, { recursive: true })

      await invokeIpc('jobs:delete', run.jobId)

      assert.deepEqual(calls.trashed, [])
      assert.equal(await ProjectStore.get(run.jobId), undefined)
    })
  })
})
