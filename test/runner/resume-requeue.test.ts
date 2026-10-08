import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import { applyTestSettings, nextJobId, readJob, resetNetworkState } from '../support/run-job.ts'

const MAX_TURNS = 5

/**
 * Writes a paused job to disk the way quitting right after a select turn leaves it:
 * the asset is selected but not queued, and every turn of the budget is spent. A job
 * that runs out of turns while running ends `failed`, so this cannot be scripted.
 */
async function writePausedJob(): Promise<string> {
  const downloadFolder = await applyTestSettings({ maxAgentIterations: MAX_TURNS })
  const jobId = nextJobId()
  const projectDir = join(downloadFolder, 'saved-job')
  await mkdir(projectDir, { recursive: true })

  const clip = video(101, 'city-street')
  const now = new Date().toISOString()
  await ProjectStore.save({
    jobId,
    projectName: 'saved-job',
    title: 'Saved job',
    script: 'One sentence.',
    status: 'paused',
    createdAt: now,
    updatedAt: now,
    downloadPath: projectDir,
    assetCount: 0
  })
  await writeFile(
    join(projectDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: jobId,
      title: 'Saved job',
      createdAt: now,
      script: 'One sentence.',
      settingsSnapshot: {
        provider: 'openai',
        modelId: 'gpt-4o',
        targetPlatform: 'YouTube',
        visualStyle: 'cinematic',
        assetMix: 'videos_and_photos',
        maxAssetsPerBeat: 1,
        maxTotalDownloads: 10,
        searchMode: 'focused'
      },
      beats: [
        {
          id: 'beat_1',
          text: 'One sentence.',
          visualPrompt: 'busy city street',
          searchQueries: ['city street'],
          status: 'selecting',
          assets: [
            {
              id: 'video_101',
              pexelsId: 101,
              type: 'video',
              url: videoFileUrl(clip, 'hd'),
              imageUrl: clip.image,
              downloadUrl: videoFileUrl(clip, 'hd'),
              width: 1920,
              height: 1080,
              duration: 12,
              photographer: 'Test Creator',
              query: 'city street',
              status: 'pending'
            }
          ]
        }
      ],
      assets: [],
      failures: []
    })
  )
  await writeFile(
    join(projectDir, 'agent-state.json'),
    JSON.stringify({
      schemaVersion: 1,
      messages: [{ role: 'user', content: 'Begin searching for stock assets.' }],
      pexelsCandidates: [],
      iterationsUsed: MAX_TURNS
    })
  )
  return jobId
}

describe('runner: resuming a saved job whose turns are spent', () => {
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

  it(
    'downloads what was already selected without asking the model',
    { todo: 'plan 04 phase 3' },
    async () => {
      const jobId = await writePausedJob()

      await invokeIpc('jobs:resume', jobId)

      const { summary, manifest } = await readJob(jobId)
      assert.deepEqual(network.problems, [])
      assert.equal(network.llmRequests().length, 0)
      assert.equal(network.mediaRequests().length, 1)
      assert.equal(summary.status, 'completed')
      const [asset] = manifest.beats[0].assets
      assert.equal(asset.status, 'completed')
      assert.ok(asset.filePath && existsSync(asset.filePath))
    }
  )
})
