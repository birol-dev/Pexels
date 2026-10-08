import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
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

describe('runner: the safety settings', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  /** What the model was sent as the result of the search it ran in its first turn. */
  function searchResultSeenByModel(): Record<string, unknown> {
    const [, , afterSearch] = network.llmRequests()
    const [result] = afterSearch.messages.filter((message) => message.role === 'tool')
    return JSON.parse(result.content || '{}')
  }

  describe('with Avoid people & faces on', () => {
    const settings = { avoidPeopleAndFaces: true }

    it('does not offer a photo whose alt text mentions people, and cannot select it', async () => {
      network.pexels.photos('street', [photo(201, 'Woman walking'), photo(202, 'Empty street')])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'street')])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 201 }])])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 202 }])])

      const run = await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      assert.deepEqual(network.problems, [])
      assert.deepEqual(searchResultSeenByModel(), {
        total_results: 2,
        results: [{ pexelsId: 202, about: 'Empty street', shape: 'landscape', size: '6000x4000' }],
        filtered: 1
      })
      const [refused, accepted] = toolResults(run, 'select_assets_for_download')
      assert.match(JSON.stringify(refused), /Security Check Failed.*201/)
      assert.doesNotMatch(JSON.stringify(accepted), /Security Check Failed/)
      assert.deepEqual(
        run.manifest.beats[0].assets.map((asset) => asset.pexelsId),
        [202]
      )
      assert.equal(run.snapshot.status, 'completed')
    })

    it('does not offer a video whose page title mentions people', async () => {
      network.pexels.videos('street', [
        video(101, 'a-crowd-crossing-the-road'),
        video(102, 'empty-street-at-dawn')
      ])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchVideos('beat_1', 'street')])
        .tools([select([{ beatId: 'beat_1', assetType: 'video', pexelsId: 102 }])])

      const run = await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      assert.deepEqual(network.problems, [])
      const seen = searchResultSeenByModel() as { results: Array<{ pexelsId: number }> }
      assert.deepEqual(
        seen.results.map((result) => result.pexelsId),
        [102]
      )
      assert.equal(seen.filtered, 1)
      assert.equal(run.snapshot.status, 'completed')
    })

    it('says so when every result was hidden, and keeps the count in the log', async () => {
      network.pexels.photos('people', [photo(201, 'Woman walking'), photo(202, 'Two men talking')])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'people')])
        .text('Done.')
        .text('Done.')
        .text('Done.')
        .text('Done.')

      const run = await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      assert.deepEqual(searchResultSeenByModel(), {
        total_results: 2,
        results: [],
        filtered: 2,
        note: 'All results were hidden by the safety settings. Search for objects or places instead.'
      })
      const [logged] = toolResults(run, 'search_pexels_photos')
      assert.deepEqual(logged, { total_results: 2, returned: 0, filtered: 2, ids: [] })
    })

    it('leaves the result as it was when nothing is hidden', async () => {
      network.pexels.photos('street', [photo(202, 'Empty street')])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'street')])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 202 }])])

      await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      const seen = searchResultSeenByModel()
      assert.equal('filtered' in seen, false)
      assert.equal('note' in seen, false)
    })
  })

  describe('with Skip explicit content on', () => {
    const settings = { skipExplicitQueries: true }

    it('refuses an explicit query without asking Pexels', async () => {
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'nude beach')])
        .text('Done.')
        .text('Done.')
        .text('Done.')
        .text('Done.')

      await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      assert.deepEqual(searchResultSeenByModel(), {
        error: 'That query is blocked by the Skip explicit setting.',
        retryable: false
      })
      assert.deepEqual(network.pexelsRequests(), [])
    })

    it('refuses an explicit video query the same way', async () => {
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchVideos('beat_1', 'sexy lingerie')])
        .text('Done.')
        .text('Done.')
        .text('Done.')
        .text('Done.')

      await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      assert.match(JSON.stringify(searchResultSeenByModel()), /blocked by the Skip explicit/)
      assert.deepEqual(network.pexelsRequests(), [])
    })

    it('hides results described as explicit', async () => {
      network.pexels.photos('statue', [photo(201, 'Nude statue in a museum'), photo(202, 'Museum')])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'statue')])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 202 }])])

      await runJob({ script: ONE_BEAT_SCRIPT }, settings)

      const seen = searchResultSeenByModel() as { results: Array<{ pexelsId: number }> }
      assert.deepEqual(
        seen.results.map((result) => result.pexelsId),
        [202]
      )
      assert.equal(seen.filtered, 1)
    })

    it('does not hide people, which is the other setting', async () => {
      network.pexels.photos('street', [photo(201, 'Woman walking')])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'street')])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 201 }])])

      const run = await runJob(
        { script: ONE_BEAT_SCRIPT },
        { skipExplicitQueries: true, avoidPeopleAndFaces: false }
      )

      assert.equal(run.snapshot.status, 'completed')
      assert.equal('filtered' in searchResultSeenByModel(), false)
    })
  })

  describe('with both settings off', () => {
    it('searches an explicit query and offers every result', async () => {
      network.pexels.photos('nude statue', [
        photo(201, 'Nude statue in a museum'),
        photo(202, 'Woman walking')
      ])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchPhotos('beat_1', 'nude statue')])
        .tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 201 }])])

      const run = await runJob(
        { script: ONE_BEAT_SCRIPT },
        { skipExplicitQueries: false, avoidPeopleAndFaces: false }
      )

      assert.deepEqual(network.problems, [])
      const seen = searchResultSeenByModel() as { results: Array<{ pexelsId: number }> }
      assert.deepEqual(
        seen.results.map((result) => result.pexelsId),
        [201, 202]
      )
      assert.equal('filtered' in seen, false)
      assert.equal(run.snapshot.status, 'completed')
    })
  })
})
