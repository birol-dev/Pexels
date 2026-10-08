import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { applyTestSettings, resetNetworkState, runJob, toolResults } from '../support/run-job.ts'
import { writeSavedJob } from '../support/saved-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

const entry = (n: number, data?: unknown): string =>
  JSON.stringify({
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'info',
    message: `entry ${n}`,
    data
  })

describe('run log entries', () => {
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

  it('logs a summary of a search, while the model and agent-state.json keep the full result', async () => {
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(toolResults(run, 'search_pexels_videos'), [
      { total_results: 1, returned: 1, ids: [101] }
    ])
    const toolMessage = (messages: Array<{ role: string; content: string | null }>): string =>
      messages.find((m) => m.role === 'tool' && m.content?.includes('"results"'))?.content ?? ''
    assert.match(toolMessage(network.llmRequests()[2].messages), /"about":"city street"/)

    const state = JSON.parse(
      await readFile(join(run.summary.downloadPath, 'agent-state.json'), 'utf8')
    )
    assert.match(toolMessage(state.messages), /"about":"city street"/)

    const logged = await readFile(join(run.summary.downloadPath, 'agent-log.jsonl'), 'utf8')
    assert.ok(!logged.includes('"about"'), 'the log file has no candidate descriptions')
  })

  describe('a saved log', () => {
    const lines = [
      ...Array.from({ length: 1500 }, (_, i) => entry(i)),
      '{ cut off in the mid',
      entry(1500, { results: 'x'.repeat(50_000) }),
      entry(1501)
    ]

    it('jobs:get returns the newest 1000 entries and shrinks the large ones', async () => {
      const { jobId } = await writeSavedJob({ status: 'paused', logLines: lines })

      const snapshot = (await invokeIpc('jobs:get', jobId)) as {
        logs: Array<{ message: string; data?: unknown }>
      }

      assert.equal(snapshot.logs.length, 999, '1000 lines were read, and one of them was cut off')
      assert.equal(snapshot.logs[0].message, 'entry 503')
      assert.equal(snapshot.logs.at(-1)?.message, 'entry 1501')
      const large = snapshot.logs.find((log) => log.message === 'entry 1500')
      assert.deepEqual(large?.data, {
        truncated: true,
        characters: JSON.stringify({ results: 'x'.repeat(50_000) }).length
      })
    })

    it('a runner that loads the job from disk starts with the same entries', async () => {
      await applyTestSettings()
      const { jobId } = await writeSavedJob({ status: 'paused', logLines: lines })
      const runner = new AgentRunner(jobId, {
        title: 'Saved job',
        script: ONE_BEAT_SCRIPT,
        platform: 'YouTube',
        style: 'cinematic',
        mix: 'videos + photos',
        maxAssetsPerBeat: 1,
        maxTotalDownloads: 10
      })

      await runner.initializeAndLoadState()

      const messages = runner.getSnapshot().logs.map((log) => log.message)
      assert.ok(!messages.includes('entry 0'), 'old entries are not loaded')
      assert.ok(messages.includes('entry 600'))
      assert.ok(messages.includes('entry 1501'))
      assert.ok(messages.length < 1020)
      await runner.cancel()
    })
  })
})
