import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  PexelsPhotoSearchResultSchema,
  PexelsVideoSearchResultSchema
} from '../../src/main/services/pexels/pexels-types.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  resetNetworkState,
  runJob,
  searchPhotos,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'

describe('runner: a complete fake job', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('fixtures pass the schemas the Pexels client validates responses with', () => {
    PexelsPhotoSearchResultSchema.parse({ total_results: 1, photos: [photo(201, 'A desk')] })
    PexelsVideoSearchResultSchema.parse({ total_results: 1, videos: [video(101, 'city')] })
  })

  it('searches, selects, downloads without being asked, and finishes', async () => {
    const clip = video(101, 'city-street')
    const still = photo(201, 'A quiet desk')
    network.pexels.videos('city street', [clip]).photos('quiet desk', [still])
    network.llm
      .tools([submitBeats(['One sentence.', 'Another sentence.'])])
      .tools([searchVideos('beat_1', 'city street'), searchPhotos('beat_2', 'quiet desk')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(clip, 'hd')
          },
          { beatId: 'beat_2', assetType: 'photo', pexelsId: 201, variantUrl: still.src.original }
        ])
      ])

    const run = await runJob()

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(run.snapshot.status, 'completed')
    assert.equal(run.summary.status, 'completed')
    assert.equal(run.summary.assetCount, 2)

    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.status),
      ['completed', 'completed']
    )
    const assets = run.manifest.beats.flatMap((beat) => beat.assets)
    assert.equal(assets.length, 2)
    for (const asset of assets) {
      assert.equal(asset.status, 'completed')
      assert.ok(asset.filePath && existsSync(asset.filePath), `${asset.id} is on disk`)
    }
    assert.ok(run.manifest.attribution, 'the manifest credits Pexels')
    assert.equal(network.mediaRequests().length, 2)

    // The beat split is a forced tool call; agent turns leave the choice to the model.
    const [beatSplit, firstTurn] = network.llmRequests()
    assert.deepEqual(beatSplit.tool_choice, {
      type: 'function',
      function: { name: 'submit_beat_plan' }
    })
    assert.equal(firstTurn.tool_choice, 'auto')
    assert.equal(network.llmRequests().length, 3, 'no turn is spent on queuing downloads')
    assert.equal(run.snapshot.usage?.totalTokens, 3 * 120)
  })
})
