import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { holdLlmRequest, until, type Gate } from '../support/gates.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  nextJobId,
  resetNetworkState,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'

const TWO_BEATS = ['One sentence.', 'Another sentence.']

describe('runner: the model selects an asset its beat already holds', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  /**
   * Starts a two-beat job and holds its fourth model request, which comes right after the
   * first selection. The second beat keeps the loop going while the first one settles.
   */
  async function startHeldAtFourthRequest(): Promise<{
    runner: AgentRunner
    run: Promise<void>
    hold: Gate
  }> {
    await applyTestSettings()
    const runner = new AgentRunner(nextJobId(), {
      title: 'Test job',
      script: TWO_BEATS.join(' '),
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 10
    })
    const hold = holdLlmRequest(4)
    await runner.ensureRegistered()
    const run = runner.start()
    await hold.reached
    return { runner, run, hold }
  }

  /** What the model was told for each call of the selection tool. */
  function selectionsTold(runner: AgentRunner): Array<Array<Record<string, unknown>>> {
    return runner
      .getSnapshot()
      .logs.filter(
        (entry) =>
          entry.type === 'tool_result' && entry.message === 'Result for select_assets_for_download'
      )
      .map((entry) => (entry.data as { selections: Array<Record<string, unknown>> }).selections)
  }

  it('downloads it again when the first download failed, and says queued', async () => {
    const clip = video(101, 'city-street')
    const other = video(102, 'busy-road')
    network.pexels.videos('city street', [clip]).videos('busy road', [other]).failNextMedia(404)
    const pick = {
      beatId: 'beat_1',
      assetType: 'video' as const,
      pexelsId: 101,
      variantUrl: videoFileUrl(clip, 'hd')
    }
    network.llm
      .tools([submitBeats(TWO_BEATS)])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([select([pick])])
      // Held until the first download has failed, so this picks a failed record again.
      .tools([select([pick])])
      .tools([searchVideos('beat_2', 'busy road')])
      .tools([select([{ beatId: 'beat_2', assetType: 'video', pexelsId: 102 }])])

    const { runner, run, hold } = await startHeldAtFourthRequest()
    await until(() => runner.getSnapshot().beats[0].assets[0]?.status === 'failed')
    hold.release()
    await withDeadline(runner, run)

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(runner.getSnapshot().status, 'completed')
    assert.deepEqual(selectionsTold(runner), [
      [{ pexelsId: 101, status: 'queued' }],
      [{ pexelsId: 101, status: 'queued' }],
      [{ pexelsId: 102, status: 'queued' }]
    ])
    assert.equal(network.mediaRequests().length, 3, 'the failed file was requested a second time')
    const { assets } = runner.getSnapshot().beats[0]
    assert.equal(assets.length, 1)
    assert.equal(assets[0].status, 'completed')
    assert.equal(assets[0].error, undefined)
  })

  it('refuses it, and downloads nothing, when the user deleted it from the library', async () => {
    const clip = video(101, 'city-street')
    const next = video(103, 'night-road')
    const other = video(102, 'busy-road')
    network.pexels
      .videos('city street', [clip])
      .videos('night traffic', [next])
      .videos('busy road', [other])
    const pick = {
      beatId: 'beat_1',
      assetType: 'video' as const,
      pexelsId: 101,
      variantUrl: videoFileUrl(clip, 'hd')
    }
    network.llm
      .tools([submitBeats(TWO_BEATS)])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([select([pick])])
      // Held until the clip is deleted, so this picks a deleted record again.
      .tools([select([pick])])
      .tools([searchVideos('beat_1', 'night traffic'), searchVideos('beat_2', 'busy road')])
      .tools([
        select([
          { beatId: 'beat_1', assetType: 'video', pexelsId: 103 },
          { beatId: 'beat_2', assetType: 'video', pexelsId: 102 }
        ])
      ])

    const { runner, run, hold } = await startHeldAtFourthRequest()
    await until(() => runner.getSnapshot().beats[0].assets[0]?.status === 'completed')
    await runner.deleteLocalAsset('video_101')
    hold.release()
    await withDeadline(runner, run)

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    const told = selectionsTold(runner)
    assert.equal(told.length, 3)
    assert.equal(told[1].length, 1)
    assert.equal(told[1][0].status, 'rejected')
    assert.match(String(told[1][0].reason), /deleted/)
    assert.match(String(told[1][0].reason), /different asset/)
    const clipRequests = network
      .mediaRequests()
      .filter((request) => request.url.href === videoFileUrl(clip, 'hd'))
    assert.equal(clipRequests.length, 1, 'the deleted clip was not fetched again')
    assert.equal(network.mediaRequests().length, 3)
  })
})
