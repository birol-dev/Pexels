import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerSettingsHandlers } from '../../src/main/ipc/settings.ipc.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import {
  PIPELINE,
  footageForBeats,
  rankLastFirst,
  savedFilesOf,
  sentences
} from '../support/pipeline-job.ts'
import { resetNetworkState, runJob, submitBeats, type JobRun } from '../support/run-job.ts'

type Shown = Record<string, unknown>

describe('the setting "Use thumbnails when ranking"', () => {
  let network: FakeNetwork

  before(() => {
    registerSettingsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(async () => {
    network.restore()
    await SettingsStore.updateSettings({ agentEngine: 'loop', rankWithThumbnails: false })
  })

  describe('in Settings', () => {
    it('is off by default', async () => {
      const shown = (await invokeIpc('settings:getPublicSettings')) as Shown
      assert.equal(shown.rankWithThumbnails, false)
    })

    it('is saved when it is a boolean', async () => {
      const shown = (await invokeIpc('settings:updateSettings', {
        rankWithThumbnails: true
      })) as Shown
      assert.equal(shown.rankWithThumbnails, true)
      assert.equal((await SettingsStore.getSettings()).rankWithThumbnails, true)

      await invokeIpc('settings:updateSettings', { rankWithThumbnails: false })
      assert.equal((await SettingsStore.getSettings()).rankWithThumbnails, false)
    })

    it('is left as it was when an update does not mention it', async () => {
      await invokeIpc('settings:updateSettings', { rankWithThumbnails: true })
      await invokeIpc('settings:updateSettings', { skipExplicitQueries: true })
      assert.equal((await SettingsStore.getSettings()).rankWithThumbnails, true)
    })

    it('is refused when it is anything else', async () => {
      for (const value of ['yes', 1, null, {}]) {
        await assert.rejects(
          () => invokeIpc('settings:updateSettings', { rankWithThumbnails: value }),
          undefined,
          JSON.stringify(value)
        )
      }
      assert.equal((await SettingsStore.getSettings()).rankWithThumbnails, false)
    })
  })

  describe('in a job', () => {
    /** A one-beat job on the pipeline; the model ranks the clips last first. */
    async function pipelineJob(settings: Parameters<typeof runJob>[1]): Promise<JobRun> {
      const texts = sentences(1)
      footageForBeats(network, 1)
      network.llm.tools([submitBeats(texts)]).dynamic(rankLastFirst())
      const run = await runJob({ script: texts.join(' ') }, settings)
      assert.equal(run.snapshot.status, 'completed')
      return run
    }

    it('is pinned to the job, in its snapshot and in agent-state.json', async () => {
      const run = await pipelineJob({ ...PIPELINE, rankWithThumbnails: true })

      assert.equal(run.snapshot.runtimeSettings?.rankWithThumbnails, true)
      const saved = await savedFilesOf(run.jobId)
      assert.equal(
        (saved.agentState.runtimeSettings as { rankWithThumbnails: boolean }).rankWithThumbnails,
        true
      )
    })

    it('is pinned as off for a job started with the default', async () => {
      const run = await pipelineJob(PIPELINE)

      assert.equal(run.snapshot.runtimeSettings?.rankWithThumbnails, false)
      const saved = await savedFilesOf(run.jobId)
      assert.equal(
        (saved.agentState.runtimeSettings as { rankWithThumbnails: boolean }).rankWithThumbnails,
        false
      )
    })
  })
})
