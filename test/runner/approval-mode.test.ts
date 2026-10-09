import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  nextJobId,
  readJob,
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats,
  toolResults,
  withDeadline
} from '../support/run-job.ts'

describe('runner: approval before download', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('processes every select call of a turn, pauses once, and finishes after approval', async () => {
    const clips = [video(101, 'city'), video(102, 'forest'), video(103, 'ocean')]
    const queries = ['city street', 'forest path', 'ocean waves']
    clips.forEach((clip, index) => network.pexels.videos(queries[index], [clip]))

    network.llm
      .tools([submitBeats(['First sentence.', 'Second sentence.', 'Third sentence.'])])
      .tools(queries.map((query, index) => searchVideos(`beat_${index + 1}`, query)))
      // One select call per beat, which is what models often send.
      .tools(
        clips.map((clip, index) =>
          select([
            {
              beatId: `beat_${index + 1}`,
              assetType: 'video',
              pexelsId: clip.id,
              variantUrl: videoFileUrl(clip, 'hd')
            }
          ])
        )
      )

    const run = await runJob(
      { script: 'First sentence. Second sentence. Third sentence.' },
      { requireApprovalBeforeDownload: true }
    )

    assert.equal(run.snapshot.status, 'paused')
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.status)),
      [['pending'], ['pending'], ['pending']],
      'all three selections were recorded before the pause'
    )
    assert.equal(network.mediaRequests().length, 0, 'nothing downloads before approval')

    // None of the three calls was skipped, and the user is asked once.
    assert.deepEqual(
      toolResults(run, 'select_assets_for_download').map((answer) => answer.status),
      ['awaiting_user_approval', 'awaiting_user_approval', 'awaiting_user_approval']
    )
    assert.deepEqual(
      run.snapshot.logs
        .filter((entry) => entry.message.startsWith('Awaiting user approval'))
        .map((entry) => entry.message),
      ['Awaiting user approval for 3 selected assets.']
    )

    await withDeadline(run.runner, run.runner.approveAndResume({}))

    const { summary, manifest } = await readJob(run.jobId)
    assert.deepEqual(network.problems, [])
    assert.equal(summary.status, 'completed')
    assert.equal(network.mediaRequests().length, 3)
    assert.equal(network.llmRequests().length, 3, 'approval needs no further model turn')
    assert.ok(manifest.beats.every((beat) => beat.status === 'completed'))
  })

  it('also runs the calls that follow a select in the same turn', async () => {
    const first = video(101, 'city')
    const second = video(102, 'forest')
    network.pexels.videos('city street', [first]).videos('forest path', [second])
    network.llm
      .tools([submitBeats(['First sentence.', 'Second sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(first, 'hd')
          }
        ]),
        searchVideos('beat_2', 'forest path')
      ])
      // After the first approval the model carries on with the second beat.
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

    const run = await runJob(
      { script: 'First sentence. Second sentence.' },
      { requireApprovalBeforeDownload: true }
    )

    assert.equal(run.snapshot.status, 'paused')
    assert.equal(network.pexelsRequests().length, 2, 'the search after the select still ran')
    assert.deepEqual(run.manifest.beats[1].searchQueries, ['forest path'])
    const searches = toolResults(run, 'search_pexels_videos')
    assert.equal(searches.length, 2)
    assert.equal(searches[1].total_results, 1, 'the model got that search result')

    await withDeadline(run.runner, run.runner.approveAndResume({}))
    assert.equal(run.runner.getSnapshot().status, 'paused', 'the second beat asks again')

    await withDeadline(run.runner, run.runner.approveAndResume({}))
    const { summary, manifest } = await readJob(run.jobId)
    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(summary.status, 'completed')
    assert.equal(network.mediaRequests().length, 2)
    assert.ok(manifest.beats.every((beat) => beat.status === 'completed'))
  })

  it('does not turn a cancel during the turn into a pause', async () => {
    const first = video(101, 'city')
    network.pexels.videos('city street', [first]).videos('forest path', [video(102, 'forest')])
    network.llm
      .tools([submitBeats(['First sentence.', 'Second sentence.'])])
      .tools([searchVideos('beat_1', 'city street')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 101,
            variantUrl: videoFileUrl(first, 'hd')
          }
        ]),
        searchVideos('beat_2', 'forest path')
      ])

    await applyTestSettings({ requireApprovalBeforeDownload: true })
    const runner = new AgentRunner(nextJobId(), {
      title: 'Test job',
      script: 'First sentence. Second sentence.',
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 10
    })
    // The user cancels while the second call of the turn runs, after the select asked for approval.
    const fakeFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('forest')) await runner.cancel()
      return fakeFetch(input, init)
    }) as typeof globalThis.fetch
    await runner.ensureRegistered()
    await withDeadline(runner, runner.start())

    const snapshot = runner.getSnapshot()
    assert.equal(snapshot.status, 'cancelled')
    assert.equal(
      snapshot.logs.some((entry) => entry.message.startsWith('Awaiting user approval')),
      false
    )
  })

  it('does not report the iteration limit when the last allowed turn pauses for approval', async () => {
    const clip = video(101, 'city')
    network.pexels.videos('city street', [clip])
    network.llm
      .tools([submitBeats(['First sentence.'])])
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

    // Two turns: the search, then the selection that asks for approval.
    const run = await runJob(
      { script: 'First sentence.' },
      { requireApprovalBeforeDownload: true, maxAgentIterations: 2 }
    )

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'paused')
    assert.equal(run.snapshot.statusReason, 'awaiting_approval')
    assert.equal(
      run.snapshot.logs.some((entry) => entry.message.includes('maximum iterations')),
      false
    )
    await run.runner.cancel()
  })
})
