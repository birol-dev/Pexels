import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork, type ToolCallSpec } from '../support/fake-network.ts'
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
})
