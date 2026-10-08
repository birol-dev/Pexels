import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner, type StartJobInput } from '../../src/main/services/agent/agent-runner.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
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
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'
import { writeSavedJob } from '../support/saved-job.ts'

const ONE_BEAT_INPUT: StartJobInput = {
  title: 'Test job',
  script: ONE_BEAT_SCRIPT,
  platform: 'YouTube',
  style: 'cinematic',
  mix: 'videos + photos',
  maxAssetsPerBeat: 1,
  maxTotalDownloads: 10
}

/** Holds the answer to the nth chat completion request until `release()` is called. */
function holdLlmRequest(nth: number): { reached: Promise<void>; release: () => void } {
  const fakeFetch = globalThis.fetch
  let seen = 0
  let release = (): void => {}
  let reachedResolve = (): void => {}
  const reached = new Promise<void>((resolve) => (reachedResolve = resolve))
  const gate = new Promise<void>((resolve) => (release = resolve))
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/chat/completions') && ++seen === nth) {
      reachedResolve()
      await gate
    }
    return fakeFetch(input, init)
  }) as typeof globalThis.fetch
  return { reached, release }
}

/** Holds the answer to a video search for `query` until `ready()` is true. */
function holdSearchUntil(query: string, ready: () => boolean): void {
  const fakeFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname === '/v1/videos/search' && url.searchParams.get('query') === query) {
      const startedAt = Date.now()
      while (!ready()) {
        if (Date.now() - startedAt > 5000) throw new Error('The condition never became true.')
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
    return fakeFetch(input, init)
  }) as typeof globalThis.fetch
}

async function savedReason(projectDir: string): Promise<unknown> {
  const state = JSON.parse(await readFile(join(projectDir, 'agent-state.json'), 'utf8'))
  return state.statusReason
}

describe('runner: job status', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  describe('finishing', () => {
    it('is decided by the loop, not by the download that happens to be last', async () => {
      const clip = video(101, 'city-street')
      network.pexels.videos('city street', [clip])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchVideos('beat_1', 'city street')])
        // The clip downloads while the second search waits, so the last download finishes in
        // the middle of this turn. The calls after it still have to run.
        .tools([
          select([
            {
              beatId: 'beat_1',
              assetType: 'video',
              pexelsId: 101,
              variantUrl: videoFileUrl(clip, 'hd')
            }
          ]),
          searchVideos('beat_1', 'busy road'),
          searchVideos('beat_1', 'night traffic')
        ])

      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT })
      holdSearchUntil(
        'busy road',
        () => runner.getSnapshot().beats[0]?.assets[0]?.status === 'completed'
      )
      await runner.ensureRegistered()
      await withDeadline(runner, runner.start())

      const snapshot = runner.getSnapshot()
      const { summary, manifest } = await readJob(snapshot.jobId)
      const state = await readFile(join(summary.downloadPath, 'agent-state.json'), 'utf8')
      assert.deepEqual(network.problems, [])
      assert.ok(!state.includes('Tool call skipped'), 'no call of the turn was skipped')
      assert.equal(network.pexelsRequests().length, 3, 'all three calls of the turn reached Pexels')
      const messages = snapshot.logs.map((entry) => entry.message)
      assert.equal(
        messages.filter((m) => m.startsWith('Result for search_pexels_videos')).length,
        3
      )
      assert.equal(
        messages.filter((m) => m.includes('Agent workflow complete')).length,
        1,
        'the loop saw that every beat was done'
      )
      assert.equal(
        messages.filter((m) => m === 'Agent execution completed successfully!').length,
        1,
        'the run was finalized once'
      )
      assert.equal(snapshot.status, 'completed')
      assert.equal(snapshot.statusReason, 'finished')
      assert.equal(summary.status, 'completed')
      assert.equal(manifest.beats[0].assets[0].status, 'completed')
    })

    it('fails a job that broke before it had any beats, and says why', async () => {
      network.llm.error(400, 'This model is not available.')

      const run = await runJob({ script: ONE_BEAT_SCRIPT })

      assert.equal(run.snapshot.status, 'failed')
      assert.equal(run.snapshot.statusReason, 'error')
      assert.equal(run.summary.status, 'failed')
      const reported = run.snapshot.logs.filter((e) => e.message.startsWith('Agent stopped'))
      assert.equal(reported.length, 1)
      assert.equal(reported[0].type, 'error')
      assert.match(reported[0].message, /This model is not available/)
    })

    it('leaves a finished job as it is when it is cancelled afterwards', async () => {
      scriptOneBeatJob(network)
      const run = await runJob({ script: ONE_BEAT_SCRIPT })
      assert.equal(run.snapshot.status, 'completed')

      await run.runner.cancel()

      assert.equal(run.runner.getSnapshot().status, 'completed')
      assert.equal((await readJob(run.jobId)).summary.status, 'completed')
      assert.ok(!run.runner.getSnapshot().logs.some((e) => e.message.includes('cancelled')))
    })
  })

  describe('pausing records why', () => {
    it('user_paused: the user pauses a running job', async () => {
      scriptOneBeatJob(network)
      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT })
      const hold = holdLlmRequest(2)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached

      await runner.pause()
      hold.release()
      await withDeadline(runner, run)

      assert.equal(runner.getSnapshot().status, 'paused')
      assert.equal(runner.getSnapshot().statusReason, 'user_paused')
      const { summary } = await readJob(runner.getSnapshot().jobId)
      assert.equal(await savedReason(summary.downloadPath), 'user_paused')
      await runner.cancel()
    })

    it('app_quit: the app closes while a job runs', async () => {
      scriptOneBeatJob(network)
      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT })
      const hold = holdLlmRequest(2)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached

      const quitting = AgentRunner.pauseAll(5000)
      hold.release()
      await quitting
      await withDeadline(runner, run)

      assert.equal(runner.getSnapshot().status, 'paused')
      assert.equal(runner.getSnapshot().statusReason, 'app_quit')
      const { summary } = await readJob(runner.getSnapshot().jobId)
      assert.equal(await savedReason(summary.downloadPath), 'app_quit')
      await runner.cancel()
    })

    it('awaiting_approval: the selected assets wait for the user', async () => {
      const clip = video(101, 'city-street')
      network.pexels.videos('city street', [clip])
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
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

      const run = await runJob({ script: ONE_BEAT_SCRIPT }, { requireApprovalBeforeDownload: true })

      assert.equal(run.snapshot.status, 'paused')
      assert.equal(run.snapshot.statusReason, 'awaiting_approval')
      assert.equal(await savedReason(run.summary.downloadPath), 'awaiting_approval')

      // Approving moves the job on, and the reason goes with it.
      await withDeadline(run.runner, run.runner.approveAndResume({}))
      assert.equal(run.runner.getSnapshot().status, 'completed')
      assert.equal(run.runner.getSnapshot().statusReason, 'finished')
    })

    it('pexels_quota: Pexels has no requests left', async () => {
      network.pexels.quota = {
        limit: 20000,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60
      }
      network.pexels.failNextSearch(429)
      network.llm
        .tools([submitBeats([ONE_BEAT_SCRIPT])])
        .tools([searchVideos('beat_1', 'city street')])

      const run = await runJob({ script: ONE_BEAT_SCRIPT }, {}, { deadlineMs: 2000 })

      assert.equal(run.snapshot.status, 'paused')
      assert.equal(run.snapshot.statusReason, 'pexels_quota')
      assert.equal(await savedReason(run.summary.downloadPath), 'pexels_quota')
      await run.runner.cancel()
    })

    it('restored: a saved job is loaded into a new runner', async () => {
      await applyTestSettings()
      // Cut off while it ran: the last reason saved is why it started.
      const cutOff = await writeSavedJob({
        status: 'paused',
        agentState: { statusReason: 'resumed' }
      })
      const runner = new AgentRunner(cutOff.jobId, { ...ONE_BEAT_INPUT })

      await runner.initializeAndLoadState()

      assert.equal(runner.getSnapshot().status, 'paused')
      assert.equal(runner.getSnapshot().statusReason, 'restored')
      assert.equal(await savedReason(cutOff.projectDir), 'restored', 'loading writes it back')
      await runner.cancel()
    })

    it('keeps the reason a saved job was paused for when a new runner loads it', async () => {
      await applyTestSettings()
      const saved = await writeSavedJob({
        status: 'paused',
        agentState: { statusReason: 'pexels_quota' }
      })
      const runner = new AgentRunner(saved.jobId, { ...ONE_BEAT_INPUT })

      await runner.initializeAndLoadState()

      assert.equal(runner.getSnapshot().statusReason, 'pexels_quota')
      assert.equal(await savedReason(saved.projectDir), 'pexels_quota')
      await runner.cancel()
    })
  })

  describe('cancelling', () => {
    it('stays cancelled when the user cancels while a resume waits for the paused run to wind down', async () => {
      scriptOneBeatJob(network)
      await applyTestSettings()
      const runner = new AgentRunner(nextJobId(), { ...ONE_BEAT_INPUT })
      const hold = holdLlmRequest(2)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached
      await runner.pause()
      // Resume waits for the aborted run to end, and the user cancels in the meantime.
      const resuming = runner.resume()
      await runner.cancel()
      hold.release()
      await withDeadline(runner, run)
      await resuming

      const snapshot = runner.getSnapshot()
      assert.equal(snapshot.status, 'cancelled')
      assert.equal(snapshot.statusReason, 'user_cancelled')
      assert.equal((await readJob(snapshot.jobId)).summary.status, 'cancelled')
      assert.equal(AgentRunner.getActive(snapshot.jobId), undefined)
      assert.equal(network.llmRequests().length, 2, 'the cancelled job asked for nothing more')

      // Asking again later changes nothing either.
      await runner.resume()
      await runner.approveAndResume({})
      assert.equal(runner.getSnapshot().status, 'cancelled')
    })
  })

  describe('jobs without a runner', () => {
    it('jobs:cancel only cancels a paused job; a finished one stays as it ended', async () => {
      const jobs = {
        completed: await writeSavedJob({ status: 'completed' }),
        failed: await writeSavedJob({ status: 'failed' }),
        cancelled: await writeSavedJob({ status: 'cancelled' }),
        paused: await writeSavedJob({ status: 'paused' })
      }

      for (const { jobId } of Object.values(jobs)) await invokeIpc('jobs:cancel', jobId)

      for (const [name, { jobId }] of Object.entries(jobs)) {
        const expected = name === 'paused' ? 'cancelled' : name
        assert.equal((await ProjectStore.get(jobId))?.status, expected, name)
      }
      // An id that is not in the registry is not an error.
      await invokeIpc('jobs:cancel', 'job_1')
    })

    it('jobs:get tells a paused job why it is paused, from what was saved with it', async () => {
      const reasonOf = async (agentState: Record<string, unknown> | null): Promise<unknown> => {
        const { jobId } = await writeSavedJob({ status: 'paused', agentState })
        return ((await invokeIpc('jobs:get', jobId)) as { statusReason?: string }).statusReason
      }

      assert.equal(await reasonOf({ statusReason: 'pexels_quota' }), 'pexels_quota')
      assert.equal(await reasonOf({ statusReason: 'awaiting_approval' }), 'awaiting_approval')
      assert.equal(await reasonOf({ statusReason: 'app_quit' }), 'app_quit')
      // The app stopped while the job ran: the last reason saved is why it started.
      assert.equal(await reasonOf({ statusReason: 'resumed' }), 'restored')
      assert.equal(await reasonOf({}), 'restored')
      assert.equal(await reasonOf(null), 'restored')

      const { jobId } = await writeSavedJob({ status: 'completed' })
      const finished = (await invokeIpc('jobs:get', jobId)) as { statusReason?: string }
      assert.equal(finished.statusReason, undefined)
    })
  })
})
