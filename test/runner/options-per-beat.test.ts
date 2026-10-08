import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  installFakeNetwork,
  type FakeNetwork,
  type LlmRequestBody,
  type ToolCallSpec
} from '../support/fake-network.ts'
import { video } from '../support/pexels-fixtures.ts'
import { resetNetworkState, runJob, searchVideos, select, submitBeats } from '../support/run-job.ts'

const SCRIPT = 'The market crashed overnight. Fortunes vanished.'

describe('runner: options per beat', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  const pick = (beatId: string, pexelsId: number): ToolCallSpec =>
    select([{ beatId, assetType: 'video', pexelsId }])

  it('keeps going until a beat has the options it was asked for', async () => {
    network.pexels.videos('city street', [video(101, 'city-street'), video(102, 'city-night')])
    network.llm
      .tools([submitBeats(['One sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([pick('beat_1', 101)])
      .tools([pick('beat_1', 102)])

    const run = await runJob({ script: 'One sentence.', maxAssetsPerBeat: 2 })

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'the second selection was asked for')
    assert.equal(run.snapshot.status, 'completed')
    assert.deepEqual(
      run.manifest.beats[0].assets.map((asset) => asset.pexelsId),
      [101, 102]
    )
  })

  it('stops at one asset per beat when the target is one', async () => {
    network.pexels.videos('city street', [video(101, 'city-street'), video(102, 'city-night')])
    network.llm
      .tools([submitBeats(['One sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([pick('beat_1', 101)])

    const run = await runJob({ script: 'One sentence.', maxAssetsPerBeat: 1 })

    assert.deepEqual(network.problems, [])
    assert.equal(network.llmRequests().length, 3, 'no fourth turn')
    assert.equal(run.snapshot.status, 'completed')
    assert.equal(run.manifest.beats[0].assets.length, 1)
  })

  it('asks no more of a beat than its share of the download cap', async () => {
    // Four downloads over two beats is two each, so a target of three is two.
    network.pexels
      .videos('q1', [video(101, 'one'), video(103, 'three'), video(105, 'five')])
      .videos('q2', [video(102, 'two'), video(104, 'four'), video(106, 'six')])
    network.llm
      .tools([submitBeats(['The market crashed overnight.', 'Fortunes vanished.'])])
      .tools([searchVideos('beat_1', 'q1'), searchVideos('beat_2', 'q2')])
      .tools([pick('beat_1', 101), pick('beat_2', 102)])
      .tools([pick('beat_1', 103), pick('beat_2', 104)])

    const run = await runJob({ script: SCRIPT, maxAssetsPerBeat: 3, maxTotalDownloads: 4 })

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0)
    assert.equal(run.snapshot.status, 'completed')
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.assets.length),
      [2, 2]
    )
  })

  it('asks for one asset per beat when the cap covers no more', async () => {
    network.pexels.videos('q1', [video(101, 'one'), video(103, 'three')])
    network.pexels.videos('q2', [video(102, 'two')])
    network.llm
      .tools([submitBeats(['The market crashed overnight.', 'Fortunes vanished.'])])
      .tools([searchVideos('beat_1', 'q1'), searchVideos('beat_2', 'q2')])
      .tools([pick('beat_1', 101), pick('beat_2', 102)])

    const run = await runJob({ script: SCRIPT, maxAssetsPerBeat: 3, maxTotalDownloads: 2 })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.assets.length),
      [1, 1]
    )
  })

  describe('when the model replies without a tool call', () => {
    /** The user message a request carries that names beats short of their assets, if any. */
    const nudgeIn = (request: LlmRequestBody): string | undefined =>
      request.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content ?? '')
        .find((content) => /assets yet|still needs? footage|no usable results/.test(content))

    const errorsIn = (run: {
      snapshot: { logs: Array<{ type: string; message: string }> }
    }): string[] =>
      run.snapshot.logs.filter((entry) => entry.type === 'error').map((entry) => entry.message)

    const TWO_BEATS = 'First one. Second one.'

    it('names a beat that has some of its options by how many it has', async () => {
      network.pexels
        .videos('q1', [video(101, 'a'), video(103, 'c'), video(105, 'e')])
        .videos('q2', [video(102, 'b'), video(104, 'd'), video(106, 'f')])
      network.llm
        .tools([submitBeats(['First one.', 'Second one.'])])
        .tools([searchVideos('beat_1', 'q1'), searchVideos('beat_2', 'q2')])
        .tools([
          select([
            { beatId: 'beat_1', assetType: 'video', pexelsId: 101 },
            { beatId: 'beat_2', assetType: 'video', pexelsId: 102 },
            { beatId: 'beat_2', assetType: 'video', pexelsId: 104 },
            { beatId: 'beat_2', assetType: 'video', pexelsId: 106 }
          ])
        ])
        .text('That should be enough.')
        .tools([
          select([
            { beatId: 'beat_1', assetType: 'video', pexelsId: 103 },
            { beatId: 'beat_1', assetType: 'video', pexelsId: 105 }
          ])
        ])

      const run = await runJob({
        script: TWO_BEATS,
        maxAssetsPerBeat: 3,
        maxTotalDownloads: 20
      })

      assert.deepEqual(network.problems, [])
      assert.equal(
        nudgeIn(network.llmRequests()[4]),
        '1 beat does not have its 3 assets yet, for example beat_1 ("stock footage 1") has 1. Search for it now.'
      )
      // The model's next reply fills the beat, and the run ends without asking it again.
      assert.equal(network.llm.remaining(), 0)
      assert.equal(network.llmRequests().length, 5)
      assert.equal(run.snapshot.status, 'completed')
      assert.deepEqual(errorsIn(run), [])
    })

    it('counts beats with nothing and beats with some, and sends the empty ones to a broader query', async () => {
      network.pexels
        .videos('q1', [video(101, 'a'), video(103, 'c'), video(105, 'e')])
        .videos('q2', [video(102, 'b'), video(104, 'd'), video(106, 'f')])
      network.llm
        .tools([submitBeats(['First one.', 'Second one.'])])
        .tools([searchVideos('beat_2', 'q2')])
        .tools([pick('beat_2', 102)])
        .text('That should be enough.')
        .tools([searchVideos('beat_1', 'q1')])
        .tools([
          select([
            { beatId: 'beat_1', assetType: 'video', pexelsId: 101 },
            { beatId: 'beat_1', assetType: 'video', pexelsId: 103 },
            { beatId: 'beat_1', assetType: 'video', pexelsId: 105 },
            { beatId: 'beat_2', assetType: 'video', pexelsId: 104 },
            { beatId: 'beat_2', assetType: 'video', pexelsId: 106 }
          ])
        ])

      const run = await runJob({
        script: TWO_BEATS,
        maxAssetsPerBeat: 3,
        maxTotalDownloads: 20,
        searchMode: 'broad'
      })

      assert.deepEqual(network.problems, [])
      assert.equal(
        nudgeIn(network.llmRequests()[4]),
        '2 beats do not have their 3 assets yet, for example beat_1 ("stock footage 1") has none, beat_2 ("stock footage 2") has 1. Search for them now. 1 beat has no usable results yet (beat_1 ("stock footage 1") not searched yet). Search again with a broader query: drop adjectives or try a synonym, place, or mood.'
      )
      assert.equal(run.snapshot.status, 'completed')
      assert.deepEqual(errorsIn(run), [])
    })

    it('ends the run when the last turn gave every beat its options, without asking again', async () => {
      network.pexels.videos('q1', [video(101, 'a'), video(103, 'c'), video(105, 'e')])
      network.llm
        .tools([submitBeats(['One sentence.'])])
        .tools([searchVideos('beat_1', 'q1')])
        .tools([
          select([
            { beatId: 'beat_1', assetType: 'video', pexelsId: 101 },
            { beatId: 'beat_1', assetType: 'video', pexelsId: 103 },
            { beatId: 'beat_1', assetType: 'video', pexelsId: 105 }
          ])
        ])
        .text('Everything is selected.')

      const run = await runJob({ script: 'One sentence.', maxAssetsPerBeat: 3 })

      assert.deepEqual(network.problems, [])
      assert.equal(network.llm.remaining(), 1, 'the model was not asked after the last selection')
      assert.equal(run.snapshot.status, 'completed')
      assert.deepEqual(errorsIn(run), [])
    })
  })
})
