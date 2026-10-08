import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { app, invokeIpc } from '../support/electron-stub.mjs'
import { downloadedBeat, emptyBeat, writeSavedJob } from '../support/saved-job.ts'

describe('reading jobs never changes them', () => {
  before(() => {
    registerJobsHandlers()
  })

  const registryFile = (): string => join(app.getPath('userData'), 'projects.json')

  it('jobs:list and jobs:get leave the registry byte-identical', async () => {
    // Each of these once got rewritten as "completed" by a read, because the manifest
    // shows every beat downloaded. Only startup recovery may decide that now.
    const paused = await writeSavedJob({ status: 'paused' })
    const failed = await writeSavedJob({ status: 'failed' })
    const running = await writeSavedJob({ status: 'running' })
    const unfinished = await writeSavedJob({
      status: 'paused',
      beats: [downloadedBeat(), emptyBeat()]
    })
    const noManifest = await writeSavedJob({ status: 'paused', manifest: 'missing' })
    const ids = [paused, failed, running, unfinished, noManifest].map((job) => job.jobId)
    const before = await readFile(registryFile())

    const listed = (await invokeIpc('jobs:list')) as Array<{ jobId: string; status: string }>
    const statusOf = (jobId: string): string | undefined =>
      listed.find((job) => job.jobId === jobId)?.status
    assert.equal(statusOf(paused.jobId), 'paused')
    assert.equal(statusOf(failed.jobId), 'failed')
    assert.equal(statusOf(running.jobId), 'running')

    for (const jobId of ids) {
      const snapshot = (await invokeIpc('jobs:get', jobId)) as { status: string }
      assert.equal(snapshot.status, statusOf(jobId), `${jobId} is returned as it is stored`)
    }
    await invokeIpc('jobs:list')

    assert.ok(before.equals(await readFile(registryFile())), 'projects.json was not rewritten')
  })

  it('jobs:get still counts the downloaded and failed files', async () => {
    const failedBeat = downloadedBeat('beat_2')
    ;(failedBeat.assets as Array<{ status: string }>)[0].status = 'failed'
    const { jobId } = await writeSavedJob({ beats: [downloadedBeat(), failedBeat] })

    const snapshot = (await invokeIpc('jobs:get', jobId)) as {
      downloadedCount: number
      failedCount: number
    }

    assert.equal(snapshot.downloadedCount, 1)
    assert.equal(snapshot.failedCount, 1)
  })
})
