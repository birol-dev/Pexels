import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { recoverInterruptedJobs } from '../src/main/services/storage/job-recovery.ts'
import { removeStaleDownloadTemps } from '../src/main/services/files/temp-cleanup.ts'

const job = (
  jobId: string,
  status: string
): { jobId: string; status: string; updatedAt: string } => ({
  jobId,
  status,
  updatedAt: '2026-01-01T00:00:00.000Z'
})

describe('recoverInterruptedJobs', () => {
  const now = new Date('2026-10-06T12:00:00.000Z')

  it('marks jobs left running by a quit or crash as paused', () => {
    const recovered = recoverInterruptedJobs([job('job_1', 'running')], now)

    assert.equal(recovered.length, 1)
    assert.equal(recovered[0].jobId, 'job_1')
    assert.equal(recovered[0].status, 'paused')
    assert.equal(recovered[0].updatedAt, '2026-10-06T12:00:00.000Z')
  })

  it('only returns jobs that need changing', () => {
    const recovered = recoverInterruptedJobs(
      [
        job('job_1', 'completed'),
        job('job_2', 'running'),
        job('job_3', 'paused'),
        job('job_4', 'failed'),
        job('job_5', 'cancelled')
      ],
      now
    )
    assert.deepEqual(
      recovered.map((j) => j.jobId),
      ['job_2']
    )
  })

  it('does not mutate the stored list', () => {
    const jobs = [job('job_1', 'running')]
    recoverInterruptedJobs(jobs, now)
    assert.equal(jobs[0].status, 'running')
    assert.equal(jobs[0].updatedAt, '2026-01-01T00:00:00.000Z')
  })

  it('returns nothing when no job was interrupted', () => {
    assert.deepEqual(recoverInterruptedJobs([], now), [])
    assert.deepEqual(recoverInterruptedJobs([job('job_1', 'completed')], now), [])
  })

  it('preserves the rest of each job record', () => {
    const full = { ...job('job_1', 'running'), title: 'My pack', assetCount: 4 }
    const [recovered] = recoverInterruptedJobs([full], now)
    assert.equal(recovered.title, 'My pack')
    assert.equal(recovered.assetCount, 4)
  })
})

describe('removeStaleDownloadTemps', () => {
  async function withProject(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'stockfinder-temps-'))
    try {
      await fn(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  it('removes partial downloads but keeps finished files', async () => {
    await withProject(async (dir) => {
      await mkdir(join(dir, 'photos'))
      await mkdir(join(dir, 'videos'))
      await writeFile(join(dir, 'photos', 'photo_1_800x600_sea.jpeg'), 'done')
      await writeFile(join(dir, 'photos', 'photo_2_800x600_sky.jpeg.tmp'), 'partial')
      await writeFile(join(dir, 'videos', 'video_3_1920x1080_city.mp4'), 'done')
      await writeFile(join(dir, 'videos', 'video_4_1920x1080_road.mp4.tmp'), 'partial')

      const removed = await removeStaleDownloadTemps(dir)

      assert.equal(removed, 2)
      assert.deepEqual(await readdir(join(dir, 'photos')), ['photo_1_800x600_sea.jpeg'])
      assert.deepEqual(await readdir(join(dir, 'videos')), ['video_3_1920x1080_city.mp4'])
    })
  })

  it('leaves files outside the download folders alone', async () => {
    await withProject(async (dir) => {
      await writeFile(join(dir, 'manifest.json'), '{}')
      await writeFile(join(dir, 'manifest.json.tmp'), '{}')

      assert.equal(await removeStaleDownloadTemps(dir), 0)
      assert.deepEqual((await readdir(dir)).sort(), ['manifest.json', 'manifest.json.tmp'])
    })
  })

  it('handles a project with no download folders yet', async () => {
    await withProject(async (dir) => {
      assert.equal(await removeStaleDownloadTemps(dir), 0)
    })
  })

  it('handles a project folder that no longer exists', async () => {
    const missing = join(tmpdir(), 'stockfinder-does-not-exist-' + Date.now())
    assert.equal(await removeStaleDownloadTemps(missing), 0)
  })
})
