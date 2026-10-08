import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  resetNetworkState,
  runJob,
  searchPhotos,
  searchVideos,
  select,
  submitBeats,
  toolResults
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

describe('runner: the app picks the file when the model names none', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('downloads the smallest full-HD file of a clip', async () => {
    // The clip comes as 3840x2160, 1920x1080 and 960x540.
    const clip = video(101, 'city-street')
    network.pexels.videos('city street', [clip])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([select([{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }])])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    assert.deepEqual(
      network.mediaRequests().map((request) => request.url.href),
      [videoFileUrl(clip, 'hd')]
    )
    const [asset] = run.manifest.beats[0].assets
    assert.equal(asset.downloadUrl, videoFileUrl(clip, 'hd'))
    assert.deepEqual([asset.width, asset.height], [1920, 1080])
    const [selected] = toolResults(run, 'select_assets_for_download')
    assert.deepEqual(selected.selections, [{ pexelsId: 101, status: 'queued' }])
  })

  it('downloads large2x of a landscape photo and the original of a portrait one', async () => {
    const wide = photo(201, 'A quiet desk', 6000, 4000)
    const tall = photo(202, 'A tall lighthouse', 4000, 6000)
    network.pexels.photos('quiet desk', [wide]).photos('tall lighthouse', [tall])
    network.llm
      .tools([submitBeats(['One sentence.', 'Another sentence.'])])
      .tools([searchPhotos('beat_1', 'quiet desk'), searchPhotos('beat_2', 'tall lighthouse')])
      .tools([
        select([
          { beatId: 'beat_1', assetType: 'photo', pexelsId: 201 },
          { beatId: 'beat_2', assetType: 'photo', pexelsId: 202 }
        ])
      ])

    const run = await runJob()

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    const [first] = run.manifest.beats[0].assets
    const [second] = run.manifest.beats[1].assets
    assert.equal(first.downloadUrl, wide.src.large2x)
    assert.deepEqual([first.width, first.height], [1880, 1253])
    assert.equal(second.downloadUrl, tall.src.original)
    assert.deepEqual([second.width, second.height], [4000, 6000])
    assert.match(basename(second.filePath || ''), /4000x6000/)
  })

  it('still honors a file the model names from the search', async () => {
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
            variantUrl: videoFileUrl(clip, 'sd')
          }
        ])
      ])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.manifest.beats[0].assets[0].downloadUrl, videoFileUrl(clip, 'sd'))
  })

  it('rejects a file that does not belong to the asset, then accepts a selection without one', async () => {
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
            variantUrl: 'https://videos.pexels.com/video-files/999/not-from-this-job.mp4'
          }
        ])
      ])
      .tools([select([{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }])])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    const [refused, accepted] = toolResults(run, 'select_assets_for_download')
    const [refusal] = refused.selections as Array<{ status: string; reason: string }>
    assert.equal(refusal.status, 'rejected')
    assert.match(refusal.reason, /Security Check Failed/)
    assert.deepEqual(accepted.selections, [{ pexelsId: 101, status: 'queued' }])
    assert.equal(network.mediaRequests().length, 1, 'only the accepted selection downloaded')
    assert.equal(run.manifest.beats[0].assets[0].downloadUrl, videoFileUrl(clip, 'hd'))
  })

  it('rejects an asset that has no file to download', async () => {
    const empty = { ...video(101, 'city-street'), video_files: [] }
    const clip = video(102, 'harbor-at-dawn')
    network.pexels.videos('city street', [empty, clip])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([select([{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }])])
      .tools([select([{ beatId: 'beat_1', assetType: 'video', pexelsId: 102 }])])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    const [refused] = toolResults(run, 'select_assets_for_download')
    assert.deepEqual(refused.selections, [
      { pexelsId: 101, status: 'rejected', reason: 'No downloadable file found for asset 101.' }
    ])
    assert.equal(run.manifest.beats[0].assets.length, 1)
    assert.equal(run.manifest.beats[0].assets[0].pexelsId, 102)
  })
})
