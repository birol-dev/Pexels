import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { StartJobInput } from '../../src/main/services/agent/agent-runner.ts'
import { installFakeNetwork, type FakeNetwork, type ToolCallSpec } from '../support/fake-network.ts'
import { photo, video } from '../support/pexels-fixtures.ts'
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

/** The function names of the tools a request offered. */
function offered(request: { tools?: unknown[] }): string[] {
  return (request.tools as Array<{ function: { name: string } }>).map((t) => t.function.name)
}

describe('runner: which tools the model is offered', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  /** One beat that searches with `search`, then selects the result of that type. */
  function scriptOneBeat(search: ToolCallSpec, type: 'photo' | 'video', id: number): void {
    network.pexels
      .videos('city street', [video(101, 'city-street')])
      .photos('quiet desk', [photo(201, 'A quiet desk')])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([search])
      .tools([select([{ beatId: 'beat_1', assetType: type, pexelsId: id }])])
  }

  const cases: Array<[StartJobInput['mix'], string[]]> = [
    [
      'videos only',
      ['search_pexels_videos', 'select_assets_for_download', 'download_selected_assets']
    ],
    [
      'photos only',
      ['search_pexels_photos', 'select_assets_for_download', 'download_selected_assets']
    ],
    [
      'videos + photos',
      [
        'search_pexels_photos',
        'search_pexels_videos',
        'select_assets_for_download',
        'download_selected_assets'
      ]
    ]
  ]

  for (const [mix, tools] of cases) {
    it(`offers only the search tools the mix allows: ${mix}`, async () => {
      if (mix === 'photos only') scriptOneBeat(searchPhotos('beat_1', 'quiet desk'), 'photo', 201)
      else scriptOneBeat(searchVideos('beat_1', 'city street'), 'video', 101)

      const run = await runJob({ script: ONE_BEAT_SCRIPT, mix })

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      const [beatSplit, ...turns] = network.llmRequests()
      assert.equal(turns.length, 2)
      for (const turn of turns) assert.deepEqual(offered(turn), tools)
      assert.deepEqual(
        turns.map((turn) => JSON.stringify(turn.tools)),
        [JSON.stringify(turns[0].tools), JSON.stringify(turns[0].tools)],
        'the list is the same on every turn'
      )
      assert.equal(beatSplit.tools?.length, 1, 'the beat split offers only its own tool')
    })
  }

  it('does not name the search tools in the system prompt or the opening message', async () => {
    scriptOneBeat(searchPhotos('beat_1', 'quiet desk'), 'photo', 201)

    await runJob({ script: ONE_BEAT_SCRIPT, mix: 'photos only' })

    const [, firstTurn] = network.llmRequests()
    const system = firstTurn.messages.find((m) => m.role === 'system')?.content || ''
    assert.match(system, /- Asset mix: photos only/)
    assert.doesNotMatch(system, /Only call search tools/)
    assert.doesNotMatch(system, /search_pexels_videos/)
    const opening = firstTurn.messages.find((m) => m.role === 'user')?.content || ''
    assert.doesNotMatch(opening, /search_pexels_/)
  })

  it('still refuses a search type the mix excludes when a model calls it anyway', async () => {
    network.pexels.videos('city street', [video(101, 'city-street')])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])
      .text('I will look for photos.')
      .text('Done.')
      .text('Done.')
      .text('Done.')

    const run = await runJob({ script: ONE_BEAT_SCRIPT, mix: 'photos only' })

    const [refused] = toolResults(run, 'search_pexels_videos')
    assert.match(
      String(refused.error),
      /Video search is disabled because asset mix is "photos only"/
    )
    assert.equal(
      network.pexelsRequests().filter((r) => r.url.pathname === '/v1/videos/search').length,
      0
    )
  })
})

describe('runner: reasons on selections and rejections are optional', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('stores "Not chosen" for a rejection without a reason, and keeps one that has it', async () => {
    network.pexels.videos('city street', [video(101, 'city-street'), video(102, 'city-traffic')])
    network.llm
      .tools([submitBeats([ONE_BEAT_SCRIPT])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        {
          name: 'select_assets_for_download',
          args: {
            selections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }],
            rejections: [
              { beatId: 'beat_1', assetType: 'video', pexelsId: 102 },
              { beatId: 'beat_1', assetType: 'video', pexelsId: 103, reason: 'off topic' },
              { beatId: 'beat_1', assetType: 'video', pexelsId: 104, reason: '   ' }
            ]
          }
        }
      ])

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    assert.equal(run.manifest.beats[0].assets[0].pexelsId, 101)
    assert.deepEqual(run.manifest.beats[0].rejectedAssets, [
      { type: 'video', pexelsId: 102, reason: 'Not chosen' },
      { type: 'video', pexelsId: 103, reason: 'off topic' },
      { type: 'video', pexelsId: 104, reason: 'Not chosen' }
    ])
  })
})
