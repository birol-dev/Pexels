import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner, type StartJobInput } from '../../src/main/services/agent/agent-runner.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  readJob,
  resetNetworkState,
  runJob,
  searchPhotos,
  searchVideos,
  select,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'

/** What the fake LLM reports for every answer: 100 in, 20 out, nothing from the cache. */
function usageOfAnswers(count: number, cachedPerAnswer = 0): Record<string, number> {
  return {
    inputTokens: count * 100,
    outputTokens: count * 20,
    totalTokens: count * 120,
    cachedInputTokens: count * cachedPerAnswer
  }
}

/** Makes every LLM answer of the fake network report these usage fields instead of the default. */
function reportUsage(fields: Record<string, unknown>): void {
  const fakeFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await fakeFetch(input, init)
    if (!String(input).endsWith('/chat/completions') || !response.ok) return response
    const body = (await response.json()) as { usage: Record<string, unknown> }
    Object.assign(body.usage, fields)
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
}

/** Makes every LLM answer of the fake network report this many cached input tokens. */
function reportCachedTokens(perAnswer: number): void {
  reportUsage({ prompt_tokens_details: { cached_tokens: perAnswer } })
}

/** The per-turn token entries of agent-log.jsonl, by turn. */
async function turnTokensInLogFile(projectDir: string): Promise<Array<Record<string, unknown>>> {
  const lines = (await readFile(join(projectDir, 'agent-log.jsonl'), 'utf8')).trim().split('\n')
  return lines
    .map((line) => JSON.parse(line) as { message: string; data?: Record<string, unknown> })
    .filter((entry) => /^Turn \d+: /.test(entry.message))
    .map((entry) => entry.data as Record<string, unknown>)
    .sort((a, b) => Number(a.turn) - Number(b.turn))
}

describe('runner: token usage', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    // Also removes the wrapper reportCachedTokens put around the fake fetch.
    network.restore()
  })

  it('is saved in the manifest and returned by jobs:get after the job has ended', async () => {
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.equal(run.summary.status, 'completed')
    assert.deepEqual(run.manifest.usage, usageOfAnswers(3))
    // The runner is gone, so this answer comes from the manifest.
    assert.equal(AgentRunner.getActive(run.jobId), undefined)
    const stored = (await invokeIpc('jobs:get', run.jobId)) as { usage?: unknown }
    assert.deepEqual(stored.usage, usageOfAnswers(3))
  })

  it('continues from the saved total when a paused job is loaded again', async () => {
    const input: StartJobInput = {
      title: 'Two beats',
      script: 'One sentence. Another sentence.',
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 10
    }
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
    const run = await runJob(input, { requireApprovalBeforeDownload: true })
    assert.equal(run.snapshot.status, 'paused')
    assert.deepEqual(run.manifest.usage, usageOfAnswers(3))

    // What jobs:approveAndResume does after the app was restarted: a new runner that
    // knows only what is in the project folder.
    const reloaded = new AgentRunner(run.jobId, { ...input })
    await reloaded.initializeAndLoadState()
    assert.deepEqual(reloaded.getSnapshot().usage, usageOfAnswers(3))

    // Approving downloads the first clip; the second beat then takes two more answers
    // and pauses for approval again.
    network.llm
      .tools([searchPhotos('beat_2', 'quiet desk')])
      .tools([
        select([
          { beatId: 'beat_2', assetType: 'photo', pexelsId: 201, variantUrl: still.src.original }
        ])
      ])
    await withDeadline(reloaded, reloaded.approveAndResume({}))

    assert.deepEqual(network.problems, [])
    assert.equal(reloaded.getSnapshot().status, 'paused')
    assert.deepEqual(reloaded.getSnapshot().usage, usageOfAnswers(5))
    assert.deepEqual((await readJob(run.jobId)).manifest.usage, usageOfAnswers(5))

    await reloaded.cancel()
  })

  it('counts the idea expansion, and cached input tokens of every request', async () => {
    reportCachedTokens(64)
    network.llm.tools([
      {
        name: 'submit_expanded_script',
        args: { title: 'City day', script: ONE_BEAT_SCRIPT, visualConcept: 'Busy streets.' }
      }
    ])
    scriptOneBeatJob(network)

    const run = await runJob({ inputMode: 'idea', idea: 'A day in a busy city', script: '' })

    assert.deepEqual(network.problems, [])
    assert.equal(run.summary.status, 'completed')
    assert.equal(network.llmRequests().length, 4, 'one expansion, one beat split, two turns')
    assert.deepEqual(run.snapshot.usage, usageOfAnswers(4, 64))
    assert.deepEqual(run.manifest.usage, usageOfAnswers(4, 64))
  })

  it('logs the input, cached and output tokens of every agent turn', async () => {
    reportCachedTokens(64)
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    // The beat split is not an agent turn: of three answers, two are turns.
    const lines = run.snapshot.logs
      .map((entry) => entry.message)
      .filter((message) => /^Turn \d+: /.test(message))
    assert.deepEqual(lines, [
      'Turn 1: 100 input tokens (64 cached), 20 output.',
      'Turn 2: 100 input tokens (64 cached), 20 output.'
    ])

    const turns = await turnTokensInLogFile(run.summary.downloadPath)
    assert.deepEqual(turns, [
      { turn: 1, inputTokens: 100, cachedInputTokens: 64, outputTokens: 20 },
      { turn: 2, inputTokens: 100, cachedInputTokens: 64, outputTokens: 20 }
    ])
    const usage = run.manifest.usage as Record<string, number>
    assert.equal(
      turns.reduce((sum, turn) => sum + Number(turn.inputTokens), 0),
      usage.inputTokens - 100,
      'the turns add up to the job total, less the beat split'
    )
  })

  it('writes large token counts with thousands separators', async () => {
    reportUsage({
      prompt_tokens: 6210,
      completion_tokens: 410,
      total_tokens: 6620,
      prompt_tokens_details: { cached_tokens: 5800 }
    })
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.ok(
      run.snapshot.logs.some(
        (entry) => entry.message === 'Turn 1: 6,210 input tokens (5,800 cached), 410 output.'
      )
    )
    const [first] = await turnTokensInLogFile(run.summary.downloadPath)
    assert.deepEqual(first, {
      turn: 1,
      inputTokens: 6210,
      cachedInputTokens: 5800,
      outputTokens: 410
    })
  })
})
