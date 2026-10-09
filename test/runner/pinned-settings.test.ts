import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import {
  AgentRunner,
  type JobSnapshot,
  type StartJobInput
} from '../../src/main/services/agent/agent-runner.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { SecureSecrets } from '../../src/main/services/storage/secure-secrets.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { holdLlmRequest } from '../support/gates.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  nextJobId,
  resetNetworkState,
  searchVideos,
  select,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'
import { emptyBeat, writeSavedJob } from '../support/saved-job.ts'

const ONE_BEAT_INPUT: StartJobInput = {
  title: 'Test job',
  script: ONE_BEAT_SCRIPT,
  platform: 'YouTube',
  style: 'cinematic',
  mix: 'videos + photos',
  maxAssetsPerBeat: 1,
  maxTotalDownloads: 10
}

const PINNED = {
  providerId: 'openai',
  modelId: 'gpt-4o',
  maxIterations: 30,
  requestTimeoutSeconds: 60,
  skipExplicit: true,
  avoidPeople: false,
  requireApproval: false,
  engine: 'loop'
}

async function savedState(projectDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(projectDir, 'agent-state.json'), 'utf8'))
}

describe('runner: settings pinned to a job', () => {
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
    await SecureSecrets.setSecret('openrouterKey', '')
  })

  /** A job the user paused while the model chose clips, after it had searched. */
  async function pausedJob(): Promise<AgentRunner> {
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
    return runner
  }

  /** A saved job with one beat that still needs footage; the model searches, then selects. */
  async function savedJobNeedingFootage(
    agentState: Record<string, unknown> | null = {}
  ): Promise<{ jobId: string; projectDir: string }> {
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
      agentState: agentState && {
        messages: [{ role: 'user', content: 'OLD CONVERSATION' }],
        ...agentState
      }
    })
  }

  const modelsRequested = (): string[] => network.llmRequests().map((r) => r.model)

  describe('a Settings change after the job was created', () => {
    it('does not reach the job when it resumes', async () => {
      const runner = await pausedJob()
      await SettingsStore.updateSettings({ modelId: 'gpt-4o-mini', maxAgentIterations: 5 })

      await withDeadline(runner, runner.resume())

      assert.equal(runner.getSnapshot().status, 'completed')
      assert.deepEqual(network.problems, [])
      assert.deepEqual(modelsRequested(), ['gpt-4o', 'gpt-4o', 'gpt-4o', 'gpt-4o'])
      assert.deepEqual(runner.getSnapshot().runtimeSettings, PINNED)
      // It went on with the conversation it had: the search results are in the request.
      assert.ok(network.llmRequests()[3].messages.some((m) => m.role === 'tool'))
    })

    it('does not reach a job that a new runner loads from disk', async () => {
      await applyTestSettings({ modelId: 'gpt-4o-mini', maxAgentIterations: 5 })
      const saved = await savedJobNeedingFootage({ runtimeSettings: PINNED })

      await invokeIpc('jobs:resume', saved.jobId)

      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'completed')
      assert.deepEqual(network.problems, [])
      assert.deepEqual(modelsRequested(), ['gpt-4o', 'gpt-4o'])
      assert.deepEqual((await savedState(saved.projectDir)).runtimeSettings, PINNED)
    })

    it('is kept in agent-state.json from the first write of a new job', async () => {
      const runner = await pausedJob()
      const { downloadPath } = (await ProjectStore.get(runner.getSnapshot().jobId))!

      assert.deepEqual((await savedState(downloadPath)).runtimeSettings, PINNED)
      await runner.cancel()
    })
  })

  describe('a job from before settings were pinned', () => {
    it('keeps the provider and model its manifest names, and takes the limits from Settings', async () => {
      // Settings moved to another provider since. The fake network only answers OpenAI, so a
      // request to OpenRouter would show up as a problem.
      await applyTestSettings({
        llmProvider: 'openrouter',
        modelId: 'deepseek/deepseek-v4.1-flash',
        maxAgentIterations: 12
      })
      await SecureSecrets.setSecret('openrouterKey', 'or-test')
      const saved = await savedJobNeedingFootage({}) // no runtimeSettings in the state file

      await invokeIpc('jobs:resume', saved.jobId)

      assert.deepEqual(network.problems, [])
      assert.deepEqual(modelsRequested(), ['gpt-4o', 'gpt-4o'])
      assert.deepEqual((await savedState(saved.projectDir)).runtimeSettings, {
        ...PINNED,
        maxIterations: 12
      })
    })

    it('uses the current provider and model when the manifest does not name both', async () => {
      await applyTestSettings({ modelId: 'gpt-4o-mini' })
      const saved = await savedJobNeedingFootage({})
      // A model id means nothing without its provider, so half a pair is not used.
      const manifestPath = join(saved.projectDir, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      delete manifest.settingsSnapshot.provider
      await writeFile(manifestPath, JSON.stringify(manifest))

      await invokeIpc('jobs:resume', saved.jobId)

      assert.deepEqual(modelsRequested(), ['gpt-4o-mini', 'gpt-4o-mini'])
    })
  })

  describe('resume with current settings', () => {
    it('pins the job to Settings and starts a new conversation', async () => {
      const runner = await pausedJob()
      await SettingsStore.updateSettings({ modelId: 'gpt-4o-mini', maxAgentIterations: 5 })

      await withDeadline(runner, runner.resume({ useCurrentSettings: true }))

      const snapshot = runner.getSnapshot()
      assert.equal(snapshot.status, 'completed')
      assert.deepEqual(network.problems, [])
      assert.deepEqual(modelsRequested(), ['gpt-4o', 'gpt-4o', 'gpt-4o', 'gpt-4o-mini'])
      assert.deepEqual(snapshot.runtimeSettings, {
        ...PINNED,
        modelId: 'gpt-4o-mini',
        maxIterations: 5
      })

      // The first request after the resume starts over: only the opening message, none of the
      // search results the old conversation held.
      const firstAfter = network.llmRequests()[3]
      assert.ok(firstAfter.messages.every((m) => m.role !== 'tool' && !m.tool_calls))
      assert.ok(firstAfter.messages.some((m) => m.role === 'user'))
      const logged = snapshot.logs.map((entry) => entry.message)
      assert.ok(
        logged.includes(
          'Resumed with openai / gpt-4o-mini. Earlier conversation dropped because the settings changed.'
        ),
        'the log says what happened'
      )
      const { downloadPath } = (await ProjectStore.get(snapshot.jobId))!
      assert.equal(
        ((await savedState(downloadPath)).runtimeSettings as { modelId: string }).modelId,
        'gpt-4o-mini'
      )
    })

    it('moves a job to another provider and says why the conversation was dropped', async () => {
      const runner = await pausedJob()
      await applyTestSettings({
        llmProvider: 'openrouter',
        modelId: 'deepseek/deepseek-v4.1-flash'
      })
      await SecureSecrets.setSecret('openrouterKey', 'or-test')

      await withDeadline(runner, runner.resume({ useCurrentSettings: true }))

      const snapshot = runner.getSnapshot()
      assert.equal(snapshot.runtimeSettings?.providerId, 'openrouter')
      assert.ok(
        snapshot.logs.some(
          (entry) =>
            entry.message ===
            'Resumed with openrouter / deepseek/deepseek-v4.1-flash. Earlier conversation dropped because it was written for another provider.'
        )
      )
      // The fake network does not answer OpenRouter: the request went there, not to OpenAI.
      assert.ok(network.problems.some((problem) => problem.includes('openrouter.ai')))
      assert.equal(network.llmRequests().length, 3, 'nothing more went to the old provider')
    })

    it('goes through jobs:resume for a job that has no runner', async () => {
      await applyTestSettings({ modelId: 'gpt-4o-mini' })
      const saved = await savedJobNeedingFootage({ runtimeSettings: PINNED })

      await invokeIpc('jobs:resume', saved.jobId, { useCurrentSettings: true })

      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'completed')
      assert.deepEqual(modelsRequested(), ['gpt-4o-mini', 'gpt-4o-mini'])
      assert.ok(
        !JSON.stringify(network.llmRequests()).includes('OLD CONVERSATION'),
        'the earlier conversation was not sent'
      )
      assert.equal(
        ((await savedState(saved.projectDir)).runtimeSettings as { modelId: string }).modelId,
        'gpt-4o-mini'
      )
    })

    it('only accepts the options it knows', async () => {
      await applyTestSettings()
      const saved = await savedJobNeedingFootage({ runtimeSettings: PINNED })

      await assert.rejects(invokeIpc('jobs:resume', saved.jobId, { useCurrentSettings: 'yes' }))

      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'paused')
      assert.equal(network.llmRequests().length, 0)
    })
  })

  describe('a provider without a key', () => {
    it('refuses the resume, names both ways out, and leaves the job paused', async () => {
      const runner = await pausedJob()
      await SecureSecrets.setSecret('openaiKey', '')
      const requestsBefore = network.llmRequests().length

      await assert.rejects(
        runner.resume(),
        new Error(
          'This job was started with OpenAI (gpt-4o). Add an OpenAI key in Settings, or choose Resume with current settings.'
        )
      )

      assert.equal(runner.getSnapshot().status, 'paused')
      assert.equal(runner.getSnapshot().statusReason, 'user_paused')
      assert.equal(AgentRunner.getActive(runner.getSnapshot().jobId), runner)
      assert.equal(network.llmRequests().length, requestsBefore)

      // The same for approving, which also starts the run again.
      await assert.rejects(runner.approveAndResume({}), /Add an OpenAI key in Settings/)
      assert.equal(runner.getSnapshot().status, 'paused')

      // Adding the key is one way out.
      await SecureSecrets.setSecret('openaiKey', 'sk-test')
      await withDeadline(runner, runner.resume())
      assert.equal(runner.getSnapshot().status, 'completed')
    })

    it('checks the current provider when resuming with current settings', async () => {
      const runner = await pausedJob()
      await SettingsStore.updateSettings({
        llmProvider: 'openrouter',
        modelId: 'deepseek/deepseek-v4.1-flash'
      })

      await assert.rejects(
        runner.resume({ useCurrentSettings: true }),
        new Error('Add an OpenRouter key in Settings before resuming with the current settings.')
      )

      // Nothing changed: still paused, still pinned to what it was started with.
      assert.equal(runner.getSnapshot().status, 'paused')
      assert.deepEqual(runner.getSnapshot().runtimeSettings, PINNED)
      await runner.cancel()
    })

    it('is refused through jobs:resume too, and the registry still says paused', async () => {
      await applyTestSettings()
      const saved = await savedJobNeedingFootage({
        runtimeSettings: {
          ...PINNED,
          providerId: 'openrouter',
          modelId: 'deepseek/deepseek-v4.1-flash'
        }
      })

      await assert.rejects(
        invokeIpc('jobs:resume', saved.jobId),
        /This job was started with OpenRouter \(deepseek\/deepseek-v4\.1-flash\)\. Add an OpenRouter key in Settings, or choose Resume with current settings\./
      )

      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'paused')
      assert.equal(network.llmRequests().length, 0)
      // The refusal left a runner behind. The screen must still read as it did before it.
      const refused = (await invokeIpc('jobs:get', saved.jobId)) as JobSnapshot
      assert.equal(refused.status, 'paused')
      assert.equal(refused.currentStep, 'Stopped')

      // The other way out works: the current provider (OpenAI) has a key.
      await invokeIpc('jobs:resume', saved.jobId, { useCurrentSettings: true })
      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'completed')
    })
  })

  describe('jobs:get', () => {
    it('tells the screen what a job without a runner runs with', async () => {
      await applyTestSettings({ modelId: 'gpt-4o-mini', maxAgentIterations: 12 })
      const pinned = await writeSavedJob({
        status: 'paused',
        agentState: { runtimeSettings: { ...PINNED, requestTimeoutSeconds: 90 } }
      })
      const old = await writeSavedJob({ status: 'paused', agentState: {} })

      const getSettings = async (jobId: string): Promise<unknown> =>
        ((await invokeIpc('jobs:get', jobId)) as { runtimeSettings?: unknown }).runtimeSettings

      assert.deepEqual(await getSettings(pinned.jobId), { ...PINNED, requestTimeoutSeconds: 90 })
      // The manifest says gpt-4o; everything else is what Settings say today.
      assert.deepEqual(await getSettings(old.jobId), {
        ...PINNED,
        maxIterations: 12,
        requestTimeoutSeconds: 60
      })
    })

    it('ignores a saved record that is not complete', async () => {
      await applyTestSettings({ maxAgentIterations: 12 })
      const broken = await writeSavedJob({
        status: 'paused',
        agentState: { runtimeSettings: { providerId: 'openai', modelId: 'gpt-4o' } }
      })

      const job = (await invokeIpc('jobs:get', broken.jobId)) as {
        runtimeSettings?: { maxIterations: number }
      }

      assert.equal(job.runtimeSettings?.maxIterations, 12)
    })
  })
})
