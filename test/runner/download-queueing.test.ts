import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  download,
  resetNetworkState,
  runJob,
  searchPhotos,
  searchVideos,
  select,
  submitBeats,
  toolResults
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

/** Changes a setting the first time the app asks Pexels for anything, which is mid-run. */
function changeSettingDuringFirstSearch(change: { requireApprovalBeforeDownload: boolean }): void {
  const fakeFetch = globalThis.fetch
  let changed = false
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!changed && String(input).includes('api.pexels.com')) {
      changed = true
      await SettingsStore.updateSettings(change)
    }
    return fakeFetch(input, init)
  }) as typeof globalThis.fetch
}

describe('runner: selecting an asset starts its download', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    // Also removes the wrapper changeSettingDuringFirstSearch puts around the fake fetch.
    network.restore()
  })

  it('queues the download in the same call and tells the model so', async () => {
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    assert.equal(network.llmRequests().length, 3, 'the model is not asked to queue anything')
    assert.equal(network.mediaRequests().length, 1)
    const [selected] = toolResults(run, 'select_assets_for_download')
    assert.deepEqual(selected.selections, [{ pexelsId: 101, status: 'queued' }])
  })

  it('queues nothing while the user has to approve first', async () => {
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT }, { requireApprovalBeforeDownload: true })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'paused')
    assert.equal(network.mediaRequests().length, 0)
    assert.equal(run.manifest.beats[0].assets[0].status, 'pending')
    const [selected] = toolResults(run, 'select_assets_for_download')
    assert.deepEqual(selected.selections, [{ pexelsId: 101, status: 'selected' }])
    assert.equal(selected.status, 'awaiting_user_approval')

    await run.runner.cancel()
  })

  it('ignores approval being switched on during the run', async () => {
    changeSettingDuringFirstSearch({ requireApprovalBeforeDownload: true })
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed', 'the job did not stop to ask')
    assert.equal(network.mediaRequests().length, 1)
    assert.equal(run.manifest.beats[0].assets[0].status, 'completed')
  })

  it('ignores approval being switched off during the run', async () => {
    changeSettingDuringFirstSearch({ requireApprovalBeforeDownload: false })
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT }, { requireApprovalBeforeDownload: true })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'paused', 'the job still waits for the user')
    assert.equal(network.mediaRequests().length, 0)
    assert.equal(run.manifest.beats[0].assets[0].status, 'pending')

    await run.runner.cancel()
  })

  it('keeps download_selected_assets as a status call that never queues twice', async () => {
    const clip = video(101, 'city-street')
    const still = photo(201, 'A quiet desk')
    network.pexels.videos('city street', [clip]).photos('quiet desk', [still])
    network.llm
      .tools([submitBeats(['One sentence.', 'Another sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(clip, 'hd')
          }
        ])
      ])
      // An old conversation, or a model that does not trust the result, asks anyway.
      .tools([
        searchPhotos('beat_2', 'quiet desk'),
        download([{ assetType: 'video', pexelsId: 101 }])
      ])
      .tools([
        select([
          { beatId: 'beat_2', assetType: 'photo', pexelsId: 201, variantUrl: still.src.original }
        ])
      ])

    const run = await runJob()

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(run.snapshot.status, 'completed')
    assert.equal(network.mediaRequests().length, 2, 'the clip was fetched once')
    const [status] = toolResults(run, 'download_selected_assets')
    const [reported] = status.downloaded as Array<{ status: string }>
    assert.notEqual(reported.status, 'queued')
    assert.deepEqual(status.failed, [])
  })
})
