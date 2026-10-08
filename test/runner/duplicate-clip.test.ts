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
  runJob,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'

/**
 * Writes a paused job to disk the way an older version left it after the model picked
 * video 101 for both beats. With `downloaded`, the download finished on the `beat_2` copy
 * and the `beat_1` copy never left "downloading"; without it, the app was quit while both
 * copies were downloading. Returns the job id and where the downloaded file is (or would be).
 */
async function writeJobWithDuplicateRecords(options: {
  downloaded: boolean
}): Promise<{ jobId: string; filePath: string }> {
  const downloadFolder = await applyTestSettings()
  const jobId = nextJobId()
  const projectDir = join(downloadFolder, 'saved-job')
  const filePath = join(projectDir, 'videos', 'video_101_3840x2160_city-street.mp4')
  await mkdir(join(projectDir, 'videos'), { recursive: true })
  if (options.downloaded) await writeFile(filePath, 'clip')

  const clip = video(101, 'city-street')
  const record = {
    id: 'video_101',
    pexelsId: 101,
    type: 'video',
    url: videoFileUrl(clip, 'hd'),
    imageUrl: clip.image,
    downloadUrl: videoFileUrl(clip, 'hd'),
    width: 3840,
    height: 2160,
    duration: 12,
    photographer: 'Test Creator',
    query: 'city street'
  }
  const now = new Date().toISOString()
  await ProjectStore.save({
    jobId,
    projectName: 'saved-job',
    title: 'Saved job',
    script: 'One sentence. Another sentence.',
    status: 'paused',
    createdAt: now,
    updatedAt: now,
    downloadPath: projectDir,
    assetCount: options.downloaded ? 1 : 0
  })
  await writeFile(
    join(projectDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: jobId,
      title: 'Saved job',
      createdAt: now,
      script: 'One sentence. Another sentence.',
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
          status: 'downloading',
          assets: [{ ...record, status: 'downloading', progress: 0 }]
        },
        {
          id: 'beat_2',
          text: 'Another sentence.',
          visualPrompt: 'city traffic',
          searchQueries: [],
          status: options.downloaded ? 'completed' : 'downloading',
          assets: [
            options.downloaded
              ? { ...record, status: 'completed', progress: 100, filePath }
              : { ...record, status: 'downloading', progress: 0 }
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
      iterationsUsed: 3
    })
  )
  return { jobId, filePath }
}

describe('runner: the model picks one clip for two beats', () => {
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

  it('rejects the second selection, names the first beat, and still completes', async () => {
    const first = video(101, 'city-street')
    const second = video(102, 'city-night')
    network.pexels.videos('city street', [first, second])
    network.llm
      .tools([submitBeats(['One sentence.', 'Another sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(first, 'hd')
          },
          {
            beatId: 'beat_2',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(first, 'hd')
          }
        ])
      ])
      .tools([
        select([
          {
            beatId: 'beat_2',
            assetType: 'video',
            pexelsId: 102,
            variantUrl: videoFileUrl(second, 'hd')
          }
        ])
      ])

    const run = await runJob()

    // What the model was told about its duplicate pick, read from the next request.
    const toolResults = network.llmRequests()[3].messages.filter((m) => m.role === 'tool')
    const selectResult = JSON.parse(toolResults[toolResults.length - 1].content || '{}') as {
      selections: Array<{ status: string; reason?: string }>
    }
    assert.equal(selectResult.selections[0].status, 'queued')
    assert.equal(selectResult.selections[1].status, 'rejected')
    assert.match(selectResult.selections[1].reason || '', /beat_1/)

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
      [['video_101'], ['video_102']]
    )
  })

  it('repairs a saved job that has the clip on two beats, and finishes it on resume', async () => {
    const { jobId, filePath } = await writeJobWithDuplicateRecords({ downloaded: true })
    const other = video(102, 'city-night')
    network.pexels.videos('city night', [other])
    // Only beat_1 is left without footage, so that is all the model is asked for.
    network.llm.tools([searchVideos('beat_1', 'city night')]).tools([
      select([
        {
          beatId: 'beat_1',
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
    assert.equal(network.mediaRequests().length, 1, 'the clip that has a file is not fetched again')

    const [released, replacement] = manifest.beats[0].assets
    assert.equal(released.id, 'video_101')
    assert.equal(released.status, 'failed')
    assert.equal(released.error, 'Duplicate of the asset used for beat_2')
    assert.equal(replacement.id, 'video_102')
    assert.equal(replacement.status, 'completed')

    const [kept] = manifest.beats[1].assets
    assert.equal(kept.status, 'completed')
    assert.equal(kept.filePath, filePath)
  })

  it('keeps the first copy of a saved job when neither was downloaded, and downloads it', async () => {
    const { jobId } = await writeJobWithDuplicateRecords({ downloaded: false })
    const other = video(102, 'city-night')
    network.pexels.videos('city night', [other])
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

    // The download of the kept copy must land on that copy, not on the released one.
    const [kept] = manifest.beats[0].assets
    assert.equal(kept.id, 'video_101')
    assert.equal(kept.status, 'completed')
    assert.ok(kept.filePath && existsSync(kept.filePath))

    const [released, replacement] = manifest.beats[1].assets
    assert.equal(released.id, 'video_101')
    assert.equal(released.status, 'failed')
    assert.equal(released.error, 'Duplicate of the asset used for beat_1')
    assert.equal(released.filePath, undefined)
    assert.equal(replacement.id, 'video_102')
    assert.equal(replacement.status, 'completed')
  })
})
