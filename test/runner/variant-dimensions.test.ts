import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  download,
  resetNetworkState,
  runJob,
  searchPhotos,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

describe('runner: the model picks a smaller file of a clip', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('records and names the file by the size that was downloaded', async () => {
    // The clip itself is 3840x2160; the selected file is its 960x540 version.
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
      .tools([download([{ assetType: 'video', pexelsId: 101 }])])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    const [asset] = run.manifest.beats[0].assets
    assert.deepEqual([asset.width, asset.height], [960, 540])
    assert.match(basename(asset.filePath || ''), /960x540/)
  })

  it('does the same for a resized photo, whose size is in its URL', async () => {
    // The photo itself is 6000x4000; "large2x" fits it into a 1880x1300 box.
    const still = photo(201, 'A quiet desk')
    network.pexels.photos('quiet desk', [still])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchPhotos('beat_1', 'quiet desk')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'photo',
            pexelsId: 201,
            variantUrl: still.src.large2x || ''
          }
        ])
      ])
      .tools([download([{ assetType: 'photo', pexelsId: 201 }])])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    const [asset] = run.manifest.beats[0].assets
    assert.deepEqual([asset.width, asset.height], [1880, 1253])
    assert.match(basename(asset.filePath || ''), /1880x1253/)
  })
})
