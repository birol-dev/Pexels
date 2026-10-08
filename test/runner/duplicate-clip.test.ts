import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  download,
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'

describe('runner: the model picks one clip for two beats', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it(
    'rejects the second selection, names the first beat, and still completes',
    { todo: 'plan 04 phase 1' },
    async () => {
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
        .tools([
          download([
            { assetType: 'video', pexelsId: 101 },
            { assetType: 'video', pexelsId: 102 }
          ])
        ])

      const run = await runJob()

      // What the model was told about its duplicate pick, read from the next request.
      const toolResults = network.llmRequests()[3].messages.filter((m) => m.role === 'tool')
      const selectResult = JSON.parse(toolResults[toolResults.length - 1].content || '{}') as {
        selections: Array<{ status: string; reason?: string }>
      }
      assert.equal(selectResult.selections[0].status, 'selected')
      assert.equal(selectResult.selections[1].status, 'rejected')
      assert.match(selectResult.selections[1].reason || '', /beat_1/)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
        [['video_101'], ['video_102']]
      )
    }
  )
})
