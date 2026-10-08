import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner, type StartJobInput } from '../../src/main/services/agent/agent-runner.ts'
import { PexelsClient } from '../../src/main/services/pexels/pexels-client.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { holdLlmRequest, until } from '../support/gates.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  PIPELINE,
  beatsRanked,
  broaderQueries,
  clipsOfBeat,
  footageForBeats,
  pexelsQueries,
  queryOfBeat,
  rankLastFirst,
  savedFilesOf,
  sentences,
  toolsRequested,
  userContentOf
} from '../support/pipeline-job.ts'
import { beatIdsIn } from '../support/pipeline-context.ts'
import {
  applyTestSettings,
  nextJobId,
  resetNetworkState,
  runJob,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'
import { emptyBeat, writeSavedJob } from '../support/saved-job.ts'

const scriptOf = (count: number): string => sentences(count).join(' ')

/** The model's pick for a beat when it ranks last first: the sixth clip of the beat. */
const pickOf = (beat: number): string => `video_${beat * 100 + 6}`

const ONE_BEAT_INPUT: StartJobInput = {
  title: 'Test job',
  script: ONE_BEAT_SCRIPT,
  platform: 'YouTube',
  style: 'cinematic',
  mix: 'videos + photos',
  maxAssetsPerBeat: 1,
  maxTotalDownloads: 10
}

describe('runner: the pipeline engine', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(async () => {
    network.restore()
    PexelsClient.resetQuota()
    await SettingsStore.updateSettings({ agentEngine: 'loop' })
  })

  /** Starts an eight-beat job on the pipeline and stops it while the model ranks the first batches. */
  async function pausedWhileRanking(): Promise<{
    runner: AgentRunner
    answered: string[][]
    ranked: Set<string>
  }> {
    const texts = sentences(8)
    footageForBeats(network, 8)
    const answered: string[][] = []
    network.llm
      .tools([submitBeats(texts)])
      .dynamic(rankLastFirst((request) => answered.push(beatsRanked(request))))
      .dynamic(rankLastFirst((request) => answered.push(beatsRanked(request))))

    await applyTestSettings(PIPELINE)
    const runner = new AgentRunner(nextJobId(), {
      ...ONE_BEAT_INPUT,
      script: texts.join(' ')
    })
    // The second request is the first ranking batch to be sent; it stays out while the other
    // one is answered.
    const hold = holdLlmRequest(2)
    await runner.ensureRegistered()
    const run = runner.start()
    await hold.reached
    await until(() => runner.getSnapshot().currentStep === 'Ranking footage (batch 1 of 2)')
    await runner.pause()
    hold.release()
    await withDeadline(runner, run)

    assert.equal(runner.getSnapshot().status, 'paused')
    const { state } = await savedFilesOf(runner.getSnapshot().jobId)
    return { runner, answered, ranked: new Set(Object.keys(state?.rankingByBeat ?? {})) }
  }

  describe('an eight-beat job', () => {
    it('plans, searches, ranks and downloads in three model calls and eight searches', async () => {
      const texts = sentences(8)
      footageForBeats(network, 8)
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(rankLastFirst())

      const run = await runJob({ script: texts.join(' ') }, PIPELINE)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
      assert.equal(run.snapshot.runtimeSettings?.engine, 'pipeline')

      // Plan, then two ranking batches of five beats and three.
      assert.deepEqual(toolsRequested(network), [
        'submit_beat_plan',
        'submit_rankings',
        'submit_rankings'
      ])
      // One video search per beat: the first query found enough, so nothing else was sent.
      assert.deepEqual(
        pexelsQueries(network).sort(),
        Array.from({ length: 8 }, (_, i) => queryOfBeat(i + 1)).sort()
      )
      assert.ok(network.pexelsRequests().every((r) => r.url.pathname === '/v1/videos/search'))
      assert.equal(network.mediaRequests().length, 8)

      // Each beat got the clip the model ranked first, and it is on disk.
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
        Array.from({ length: 8 }, (_, i) => [pickOf(i + 1)])
      )
      assert.ok(run.manifest.beats.every((beat) => beat.status === 'completed'))
      assert.ok(run.manifest.beats.every((beat) => beat.assets[0].filePath))
    })

    it('has no conversation, and says in words what it did', async () => {
      const texts = sentences(8)
      footageForBeats(network, 8)
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(rankLastFirst())

      const run = await runJob({ script: texts.join(' ') }, PIPELINE)

      // 3 requests of 120 tokens each.
      const summary = '8 beats: all with footage. 3 model calls, 360 tokens.'
      assert.equal(run.manifest.summary, summary)
      assert.ok(run.snapshot.logs.some((entry) => entry.message === summary))
      assert.ok(run.snapshot.logs.every((entry) => entry.type !== 'tool_call'))

      const files = await savedFilesOf(run.jobId)
      assert.deepEqual(files.agentState.messages, [])
      assert.equal(files.state?.step, 'done')
      assert.equal(files.state?.modelCalls, 2)
      assert.deepEqual((files.agentState.runtimeSettings as { engine: string }).engine, 'pipeline')
    })

    it('shows the step it is on', async () => {
      const texts = sentences(8)
      footageForBeats(network, 8)
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(rankLastFirst())

      const run = await runJob({ script: texts.join(' ') }, PIPELINE)

      const steps = run.events
        .filter((event) => (event as { type: string }).type === 'progress')
        .map((event) => (event as { data: { step: string } }).data.step)
      for (const expected of [
        'Planning beats',
        'Searching Pexels (8 of 8)',
        'Ranking footage (batch 2 of 2)',
        'Selecting footage'
      ]) {
        assert.ok(steps.includes(expected), `${expected} is shown; saw ${steps.join(' | ')}`)
      }
    })
  })

  describe('a job started without the setting', () => {
    it('runs on the agent loop, as every job did before the pipeline', async () => {
      scriptOneBeatJob(network)

      const run = await runJob({ script: ONE_BEAT_SCRIPT })

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(run.snapshot.runtimeSettings?.engine, 'loop')
      assert.equal(run.manifest.summary, undefined)
      assert.ok(run.snapshot.logs.some((entry) => entry.type === 'tool_call'))
      assert.ok(!toolsRequested(network).includes('submit_rankings'))
    })
  })

  describe('approval before download', () => {
    it('replaces a rejected pick from the ranking, with no further model call', async () => {
      footageForBeats(network, 3)
      network.llm.tools([submitBeats(sentences(3))]).dynamic(rankLastFirst())

      const run = await runJob(
        { script: scriptOf(3) },
        { ...PIPELINE, requireApprovalBeforeDownload: true }
      )

      assert.equal(run.snapshot.status, 'paused')
      assert.equal(run.snapshot.statusReason, 'awaiting_approval')
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => [asset.id, asset.status])),
        [[[pickOf(1), 'pending']], [[pickOf(2), 'pending']], [[pickOf(3), 'pending']]]
      )
      assert.equal(network.mediaRequests().length, 0, 'nothing downloads before approval')
      assert.equal(network.llmRequests().length, 2)
      const searches = network.pexelsRequests().length

      // The user rejects beat 2's pick. The other two start downloading.
      await withDeadline(run.runner, run.runner.approveAndResume({ rejectedAssetIds: [pickOf(2)] }))

      const afterRejection = run.runner.getSnapshot()
      assert.equal(afterRejection.status, 'paused', 'the replacement asks for approval too')
      assert.equal(afterRejection.statusReason, 'awaiting_approval')
      const second = afterRejection.beats[1]
      assert.deepEqual(
        second.assets.map((asset) => [asset.id, asset.status]),
        [
          [pickOf(2), 'failed'],
          ['video_205', 'pending']
        ],
        'the next clip in the ranking took its place'
      )
      assert.deepEqual(
        second.rejectedAssets?.map((r) => r.pexelsId),
        [206]
      )
      assert.equal(network.mediaRequests().length, 2, 'the two approved picks were fetched')
      assert.equal(network.llmRequests().length, 2, 'no further model call')
      assert.equal(network.pexelsRequests().length, searches, 'no further search')
      assert.ok(
        afterRejection.logs.some(
          (entry) => entry.message === 'Awaiting user approval for 1 selected assets.'
        )
      )

      await withDeadline(run.runner, run.runner.approveAndResume({}))

      const done = run.runner.getSnapshot()
      assert.deepEqual(network.problems, [])
      assert.equal(done.status, 'completed')
      assert.equal(network.mediaRequests().length, 3)
      assert.equal(network.llm.remaining(), 0)
      assert.equal(network.llmRequests().length, 2)
      assert.deepEqual(
        done.beats.map((beat) => beat.assets.filter((a) => a.status === 'completed').length),
        [1, 1, 1]
      )
      // Nothing about the pipeline went into a conversation.
      assert.deepEqual((await savedFilesOf(run.jobId)).agentState.messages, [])
    })

    it('goes on from the pending picks when Resume is used instead of the review', async () => {
      footageForBeats(network, 2)
      network.llm.tools([submitBeats(sentences(2))]).dynamic(rankLastFirst())

      const run = await runJob(
        { script: scriptOf(2) },
        { ...PIPELINE, requireApprovalBeforeDownload: true }
      )
      assert.equal(run.snapshot.statusReason, 'awaiting_approval')

      await withDeadline(run.runner, run.runner.resume())

      assert.deepEqual(network.problems, [])
      assert.equal(run.runner.getSnapshot().status, 'completed')
      assert.equal(network.mediaRequests().length, 2)
      assert.equal(network.llmRequests().length, 2)
    })
  })

  describe('pause and resume', () => {
    it('keeps the batches already ranked, and repeats no search and no answered request', async () => {
      const { runner, answered, ranked } = await pausedWhileRanking()
      const jobId = runner.getSnapshot().jobId

      // One batch was answered before the pause; its beats are saved, the others are not.
      assert.equal(answered.length, 1)
      assert.deepEqual([...ranked].sort(), [...answered[0]].sort())
      assert.ok(ranked.size === 3 || ranked.size === 5, `ranked ${ranked.size} beats`)
      assert.equal(pexelsQueries(network).length, 8)
      const state = (await savedFilesOf(jobId)).state
      assert.equal(state?.step, 'searched')
      assert.equal(Object.keys(state?.candidatesByBeat ?? {}).length, 8)

      await withDeadline(runner, runner.resume())

      assert.deepEqual(network.problems, [])
      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(pexelsQueries(network).length, 8, 'the resume searched nothing again')
      assert.equal(answered.length, 2, 'the resume ranked only the other batch')
      assert.deepEqual(
        answered[1].sort(),
        Array.from({ length: 8 }, (_, i) => `beat_${i + 1}`)
          .filter((id) => !ranked.has(id))
          .sort()
      )
      assert.equal(network.llm.remaining(), 0)
      assert.equal(network.mediaRequests().length, 8)
      assert.deepEqual(
        runner.getSnapshot().beats.map((beat) => beat.assets.map((asset) => asset.id)),
        Array.from({ length: 8 }, (_, i) => [pickOf(i + 1)])
      )
    })

    it('cancels without another request', async () => {
      const { runner } = await pausedWhileRanking()
      const sent = network.requests.length

      await runner.cancel()

      assert.equal(runner.getSnapshot().status, 'cancelled')
      assert.equal((await ProjectStore.get(runner.getSnapshot().jobId))?.status, 'cancelled')
      assert.equal(AgentRunner.getActive(runner.getSnapshot().jobId), undefined)
      assert.equal(network.requests.length, sent)
      assert.equal(network.mediaRequests().length, 0)
    })

    it('can be cancelled while the model ranks', async () => {
      const texts = sentences(8)
      footageForBeats(network, 8)
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(rankLastFirst())
      await applyTestSettings(PIPELINE)
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT, script: texts.join(' ') })
      const hold = holdLlmRequest(2)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached

      await runner.cancel()
      hold.release()
      await withDeadline(runner, run)

      assert.equal(runner.getSnapshot().status, 'cancelled')
      assert.equal(network.mediaRequests().length, 0, 'nothing was downloaded')
      assert.ok(
        runner.getSnapshot().logs.every((entry) => entry.type !== 'error'),
        'a cancel is not an error'
      )
    })
  })

  describe('restarting the app', () => {
    it('carries on from agent-state.json, whatever Settings say now', async () => {
      const { runner, answered, ranked } = await pausedWhileRanking()
      const saved = await savedFilesOf(runner.getSnapshot().jobId)
      await runner.cancel()

      // A job of the same project, as a new session finds it: no runner, only the files.
      const snapshot = saved.manifest.settingsSnapshot as Record<string, unknown>
      const reloaded = await writeSavedJob({
        status: 'paused',
        beats: saved.manifest.beats as unknown[],
        snapshot,
        agentState: saved.agentState
      })
      await SettingsStore.updateSettings({ agentEngine: 'loop' })
      const sentBefore = network.llmRequests().length
      const searchesBefore = network.pexelsRequests().length

      await invokeIpc('jobs:resume', reloaded.jobId)

      assert.deepEqual(network.problems, [])
      assert.equal((await ProjectStore.get(reloaded.jobId))?.status, 'completed')
      assert.equal(network.pexelsRequests().length, searchesBefore, 'no search was repeated')
      const asked = network.llmRequests().slice(sentBefore)
      assert.deepEqual(
        asked.map((request) => request.model),
        ['gpt-4o']
      )
      assert.equal(answered.length, 2)
      assert.deepEqual(
        answered[1].sort(),
        Array.from({ length: 8 }, (_, i) => `beat_${i + 1}`)
          .filter((id) => !ranked.has(id))
          .sort()
      )
      assert.equal(network.mediaRequests().length, 8)
      const files = await savedFilesOf(reloaded.jobId)
      assert.equal(files.state?.step, 'done')
      assert.equal((files.agentState.runtimeSettings as { engine: string }).engine, 'pipeline')
      assert.deepEqual(files.agentState.messages, [])
    })
  })

  describe('the Pexels quota runs out during the searches', () => {
    it('pauses with the quota as the reason, and searches only the beats left on resume', async () => {
      footageForBeats(network, 3)
      network.llm.tools([submitBeats(sentences(3))]).dynamic(rankLastFirst())
      network.pexels.quota = {
        limit: 20000,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60
      }
      network.pexels.failNextSearch(429)

      const run = await runJob({ script: scriptOf(3) }, PIPELINE, { deadlineMs: 4000 })

      assert.equal(run.snapshot.status, 'paused')
      assert.equal(run.snapshot.statusReason, 'pexels_quota')
      assert.equal(run.summary.status, 'paused')
      const logged = run.snapshot.logs.map((entry) => entry.message).join('\n')
      assert.match(logged, /Pexels API quota is exhausted/)
      assert.match(logged, /It resets /)
      assert.equal(network.llmRequests().length, 1, 'nothing was ranked')
      const sent = network.pexelsRequests().length
      assert.ok(sent <= 3)

      // The beats searched before the stop are saved with their candidates.
      const searched = Object.keys((await savedFilesOf(run.jobId)).state?.candidatesByBeat ?? {})
      assert.ok(searched.length < 3, 'the failed search is not recorded as done')

      // The quota is back. Only the beats without candidates are searched.
      PexelsClient.resetQuota()
      network.pexels.quota.remaining = 19000
      await withDeadline(run.runner, run.runner.resume())

      assert.deepEqual(network.problems, [])
      assert.equal(run.runner.getSnapshot().status, 'completed')
      assert.equal(network.pexelsRequests().length, sent + (3 - searched.length))
      assert.equal(network.mediaRequests().length, 3)
    })
  })

  describe('a beat that finds nothing usable', () => {
    it('gets one request for broader queries, then its own search, ranking and pick', async () => {
      const texts = sentences(3)
      network.pexels
        .videos(queryOfBeat(1), clipsOfBeat(1))
        .videos(queryOfBeat(3), clipsOfBeat(3))
        .videos('harbor at dusk', clipsOfBeat(2))
      const ranked: string[][] = []
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst((request) => ranked.push(beatsRanked(request))))
        .dynamic(broaderQueries({ beat_2: ['harbor at dusk'] }))
        .dynamic(rankLastFirst((request) => ranked.push(beatsRanked(request))))

      const run = await runJob({ script: texts.join(' ') }, PIPELINE)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.deepEqual(toolsRequested(network), [
        'submit_beat_plan',
        'submit_rankings',
        'submit_broader_queries',
        'submit_rankings'
      ])
      assert.deepEqual(beatIdsIn(userContentOf(network.llmRequests()[2])), ['beat_2'])
      assert.deepEqual(
        ranked,
        [['beat_1', 'beat_3'], ['beat_2']],
        'the first ranking leaves the empty beat out, the second is for that beat alone'
      )
      assert.deepEqual(run.manifest.beats[1].searchQueries, [queryOfBeat(2), 'harbor at dusk'])
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
        [[pickOf(1)], ['video_206'], [pickOf(3)]]
      )
      assert.equal(run.manifest.summary, '3 beats: all with footage. 4 model calls, 480 tokens.')
    })

    it('asks only once: a beat that is still empty is named in the summary', async () => {
      const texts = sentences(3)
      network.pexels.videos(queryOfBeat(1), clipsOfBeat(1)).videos(queryOfBeat(3), clipsOfBeat(3))
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(broaderQueries({ beat_2: ['nothing here either'] }))

      const run = await runJob({ script: texts.join(' ') }, PIPELINE)

      assert.deepEqual(network.problems, [])
      assert.equal(network.llm.remaining(), 0)
      assert.equal(
        toolsRequested(network).filter((tool) => tool === 'submit_broader_queries').length,
        1
      )
      assert.equal(
        run.manifest.summary,
        '3 beats: 2 with footage, 1 without (beat_2 "Sentence 2.", tried: stock footage 2, nothing here either). 3 model calls, 360 tokens.'
      )
      assert.equal(
        run.snapshot.status,
        'failed',
        'the shared finalize fails a job with an empty beat'
      )
      assert.ok(run.snapshot.logs.some((entry) => entry.message === run.manifest.summary))
    })
  })

  describe('a download that fails after the last pick', () => {
    it('is replaced from the ranking without asking the model again', async () => {
      footageForBeats(network, 2)
      network.llm.tools([submitBeats(sentences(2))]).dynamic(rankLastFirst())
      // The file of beat 1's first pick is gone from Pexels.
      const gone = `https://videos.pexels.com/video-files/${pickOf(1).split('_')[1]}/`
      const inner = globalThis.fetch
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.startsWith(gone)) return new Response('gone', { status: 404 })
        return inner(input, init)
      }) as typeof globalThis.fetch

      const run = await runJob({ script: scriptOf(2) }, PIPELINE)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(network.llmRequests().length, 2, 'the model was not asked again')
      assert.deepEqual(
        run.snapshot.beats[0].assets.map((asset) => [asset.id, asset.status]),
        [
          [pickOf(1), 'failed'],
          ['video_105', 'completed']
        ]
      )
      assert.equal(run.snapshot.beats[1].assets[0].status, 'completed')
      assert.equal(run.manifest.summary, '2 beats: all with footage. 2 model calls, 240 tokens.')
    })
  })

  describe('the engine of a job', () => {
    it('is the one it started with, when Settings change while it is paused', async () => {
      const { runner } = await pausedWhileRanking()
      await SettingsStore.updateSettings({ agentEngine: 'loop' })

      await withDeadline(runner, runner.resume())

      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(runner.getSnapshot().runtimeSettings?.engine, 'pipeline')
      assert.ok(!toolsRequested(network).includes('search_pexels_videos'))
      assert.ok(runner.getSnapshot().logs.every((entry) => entry.type !== 'tool_call'))
    })

    it('stays the loop for a loop job, when Settings turn the pipeline on while it is paused', async () => {
      scriptOneBeatJob(network)
      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT })
      const hold = holdLlmRequest(3)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached
      await runner.pause()
      hold.release()
      await withDeadline(runner, run)
      assert.equal(runner.getSnapshot().status, 'paused')

      await SettingsStore.updateSettings({ agentEngine: 'pipeline' })
      await withDeadline(runner, runner.resume())

      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(runner.getSnapshot().runtimeSettings?.engine, 'loop')
      assert.ok(!toolsRequested(network).includes('submit_rankings'))
      assert.deepEqual(network.problems, [])
    })

    describe('saved jobs', () => {
      const PINNED_BEFORE_ENGINES = {
        providerId: 'openai',
        modelId: 'gpt-4o',
        maxIterations: 30,
        requestTimeoutSeconds: 60,
        skipExplicit: true,
        avoidPeople: false,
        requireApproval: false
      }

      /** A paused job with one empty beat, left by a loop session that kept a conversation. */
      async function savedLoopJob(): Promise<{ jobId: string; projectDir: string }> {
        const clip = video(101, 'city-street')
        network.pexels.videos('city street', [clip])
        network.llm.tools([searchVideos('beat_1', 'city street')]).tools([
          select([
            {
              beatId: 'beat_1',
              assetType: 'video',
              pexelsId: 101,
              variantUrl: videoFileUrl(clip, 'hd')
            }
          ])
        ])
        return writeSavedJob({
          status: 'paused',
          beats: [emptyBeat('beat_1')],
          agentState: {
            messages: [{ role: 'user', content: 'OLD CONVERSATION' }],
            runtimeSettings: PINNED_BEFORE_ENGINES
          }
        })
      }

      it('runs a job saved before engines existed on the loop, with the pipeline on in Settings', async () => {
        await applyTestSettings(PIPELINE)
        const saved = await savedLoopJob()

        await invokeIpc('jobs:resume', saved.jobId)

        assert.deepEqual(network.problems, [])
        assert.equal((await ProjectStore.get(saved.jobId))?.status, 'completed')
        assert.ok(!toolsRequested(network).includes('submit_rankings'))
        assert.equal(network.llm.remaining(), 0, 'the loop used its two scripted turns')
        const files = await savedFilesOf(saved.jobId)
        assert.equal((files.agentState.runtimeSettings as { engine: string }).engine, 'loop')
        assert.equal(files.state, undefined)
        assert.ok((files.agentState.messages as unknown[]).length > 1, 'the conversation went on')
        assert.equal(files.manifest.summary, undefined)
      })

      it('moves a loop job to the pipeline when it is resumed with the current settings', async () => {
        await applyTestSettings(PIPELINE)
        // The beat has no queries, so the pipeline searches by its visual prompt.
        network.pexels.videos('city traffic', clipsOfBeat(1))
        network.llm.dynamic(rankLastFirst())
        const saved = await writeSavedJob({
          status: 'paused',
          beats: [emptyBeat('beat_1')],
          agentState: {
            messages: [{ role: 'user', content: 'OLD CONVERSATION' }],
            runtimeSettings: { ...PINNED_BEFORE_ENGINES, engine: 'loop' }
          }
        })

        await invokeIpc('jobs:resume', saved.jobId, { useCurrentSettings: true })

        assert.deepEqual(network.problems, [])
        assert.equal((await ProjectStore.get(saved.jobId))?.status, 'completed')
        assert.deepEqual(toolsRequested(network), ['submit_rankings'])
        assert.deepEqual(pexelsQueries(network), ['city traffic'])
        const files = await savedFilesOf(saved.jobId)
        assert.equal((files.agentState.runtimeSettings as { engine: string }).engine, 'pipeline')
        assert.deepEqual(files.agentState.messages, [])
        assert.equal(files.state?.step, 'done')
      })
    })
  })
})
