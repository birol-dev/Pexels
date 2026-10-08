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
import {
  applyTestSettings,
  nextJobId,
  readJob,
  resetNetworkState,
  searchVideos,
  select
} from '../support/run-job.ts'
import type { PublicSettings } from '../../src/main/services/storage/settings-store.ts'

const MAX_TURNS = 5

/**
 * Writes a paused job to disk the way quitting right after a select turn leaves it:
 * the asset is selected but not queued, and every turn of the budget is spent. A job
 * that runs out of turns while running ends `failed`, so this cannot be scripted.
 * With `withEmptyBeat`, a second beat has no asset yet.
 */
async function writePausedJob(
  options: { withEmptyBeat?: boolean; settings?: Partial<PublicSettings> } = {}
): Promise<string> {
  const downloadFolder = await applyTestSettings({
    maxAgentIterations: MAX_TURNS,
    ...options.settings
  })
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
      script: options.withEmptyBeat ? 'One sentence. Another sentence.' : 'One sentence.',
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
        },
        ...(options.withEmptyBeat
          ? [
              {
                id: 'beat_2',
                text: 'Another sentence.',
                visualPrompt: 'city traffic',
                searchQueries: [],
                status: 'pending',
                assets: []
              }
            ]
          : [])
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

  it('downloads what was already selected without asking the model', async () => {
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
  })

  it('starts a fresh turn budget when the user resumes, and says so', async () => {
    const jobId = await writePausedJob({ withEmptyBeat: true })
    const other = video(102, 'city-night')
    network.pexels.videos('city night', [other])
    // The first beat's download is queued by the resume itself; the model only handles beat 2.
    network.llm.tools([searchVideos('beat_2', 'city night')]).tools([
      select([
        {
          beatId: 'beat_2',
          assetType: 'video',
          pexelsId: 102,
          variantUrl: videoFileUrl(other, 'hd')
        }
      ])
    ])

    await invokeIpc('jobs:resume', jobId)

    const { summary, manifest } = await readJob(jobId)
    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(summary.status, 'completed')
    assert.equal(network.mediaRequests().length, 2)
    assert.ok(manifest.beats.every((beat) => beat.assets.every((a) => a.status === 'completed')))

    const stored = (await invokeIpc('jobs:get', jobId)) as { logs: Array<{ message: string }> }
    const logged = stored.logs.map((entry) => entry.message)
    assert.ok(logged.includes(`Resumed with a fresh budget of ${MAX_TURNS} turns.`))
    assert.ok(logged.some((message) => message.startsWith(`Agent turn 1/${MAX_TURNS}`)))
  })

  it('does not give an approval round a new budget', async () => {
    const jobId = await writePausedJob({
      withEmptyBeat: true,
      settings: { requireApprovalBeforeDownload: true }
    })

    await invokeIpc('jobs:approveAndResume', jobId, {})

    const { summary, manifest } = await readJob(jobId)
    assert.deepEqual(network.problems, [])
    assert.equal(network.llmRequests().length, 0, 'no turns are left to ask the model')
    assert.equal(manifest.beats[0].assets[0].status, 'completed', 'the approved asset downloaded')
    assert.equal(manifest.beats[1].assets.length, 0)
    assert.equal(summary.status, 'failed')
  })
})
