import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import {
  installFakeNetwork,
  type FakeNetwork,
  type LlmRequestBody,
  type ToolCallSpec
} from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  readJob,
  resetNetworkState,
  runJob,
  searchVideos,
  select
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'
import { emptyBeat, writeSavedJob } from '../support/saved-job.ts'

const SCRIPT = 'The market crashed overnight. Fortunes vanished. Nobody saw it coming.'

/** A beat-split reply: the beats end after these sentence numbers. */
function plan(...ends: number[]): ToolCallSpec {
  return {
    name: 'submit_beat_plan',
    args: {
      beats: ends.map((lastSentence, index) => ({
        lastSentence,
        visualPrompt: `picture ${index + 1}`,
        queries: [`first query ${index + 1}`, `second query ${index + 1}`],
        assetType: index === 0 ? 'video' : 'photo'
      }))
    }
  }
}

const systemPromptOf = (request: LlmRequestBody): string =>
  request.messages.find((message) => message.role === 'system')?.content || ''

/** What the first agent turn was given as the beat catalog. */
function catalogOf(request: LlmRequestBody): Array<Record<string, unknown>> {
  const catalog = request.messages.find((m) => m.content?.startsWith('Visual beat catalog'))
  assert.ok(catalog, 'the request has a beat catalog')
  return JSON.parse((catalog.content as string).split('\n').slice(1).join('\n'))
}

describe('runner: the beat plan', () => {
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

  /** After the beat split the model finds nothing and stops, so the job fails quickly. */
  function endAfterBeatSplit(): void {
    network.llm.text('Done.').text('Done.').text('Done.').text('Done.')
  }

  it('makes beats from the plan, with the queries and asset types it gave', async () => {
    network.llm.tools([plan(1, 3)])
    endAfterBeatSplit()

    const run = await runJob({ script: SCRIPT })

    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.text),
      ['The market crashed overnight.', 'Fortunes vanished. Nobody saw it coming.']
    )
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.visualPrompt),
      ['picture 1', 'picture 2']
    )
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.queries),
      [
        ['first query 1', 'second query 1'],
        ['first query 2', 'second query 2']
      ]
    )
    assert.deepEqual(
      run.manifest.beats.map((beat) => beat.assetType),
      ['video', 'photo']
    )
  })

  it('sends the numbered sentences and asks for the plan tool', async () => {
    network.llm.tools([plan(3)])
    endAfterBeatSplit()

    await runJob({ script: SCRIPT })

    const [beatSplit] = network.llmRequests()
    assert.deepEqual(beatSplit.tool_choice, {
      type: 'function',
      function: { name: 'submit_beat_plan' }
    })
    assert.equal(beatSplit.tools?.length, 1)
    assert.deepEqual(
      beatSplit.messages.filter((m) => m.role === 'user').map((m) => m.content),
      ['[1] The market crashed overnight.\n[2] Fortunes vanished.\n[3] Nobody saw it coming.']
    )
  })

  // Too early (a sentence is left over), too far, and not increasing.
  for (const ends of [
    [1, 2],
    [1, 9],
    [2, 1, 3]
  ]) {
    it(`sends no second request when the beat ends are ${ends.join(', ')}`, async () => {
      network.llm.tools([plan(...ends)])
      endAfterBeatSplit()

      const run = await runJob({ script: SCRIPT })

      assert.equal(run.manifest.beats.map((beat) => beat.text).join(' '), SCRIPT)
      const splitRequests = network
        .llmRequests()
        .filter((request) => JSON.stringify(request.tools).includes('submit_beat_plan'))
      assert.equal(splitRequests.length, 1, 'no retry')
      assert.ok(
        run.snapshot.logs.some((entry) => /beat plan did not end each beat/.test(entry.message)),
        'the repair is logged'
      )
    })
  }

  it('does not log a repair for a plan that fits', async () => {
    network.llm.tools([plan(1, 2, 3)])
    endAfterBeatSplit()

    const run = await runJob({ script: SCRIPT })

    assert.equal(run.manifest.beats.length, 3)
    assert.ok(!run.snapshot.logs.some((entry) => /beat plan did not end/.test(entry.message)))
  })

  it('fails the job, with a reason, when the model submits no plan', async () => {
    network.llm.text('Here are some beats.')

    const run = await runJob({ script: SCRIPT })

    assert.equal(run.snapshot.status, 'failed')
    assert.ok(
      run.snapshot.logs.some(
        (entry) => entry.type === 'error' && /did not return structured beats/.test(entry.message)
      )
    )
    assert.equal(network.llmRequests().length, 1, 'one request, not a retry')
  })

  it('shows the model the queries and asset type of each beat, and tells it to start with the first', async () => {
    network.llm.tools([plan(1, 3)])
    endAfterBeatSplit()

    await runJob({ script: SCRIPT })

    const [, firstTurn] = network.llmRequests()
    assert.deepEqual(
      catalogOf(firstTurn).map(({ id, text, visualPrompt, queries, assetType }) => ({
        id,
        text,
        visualPrompt,
        queries,
        assetType
      })),
      [
        {
          id: 'beat_1',
          text: 'The market crashed overnight.',
          visualPrompt: 'picture 1',
          queries: ['first query 1', 'second query 1'],
          assetType: 'video'
        },
        {
          id: 'beat_2',
          text: 'Fortunes vanished. Nobody saw it coming.',
          visualPrompt: 'picture 2',
          queries: ['first query 2', 'second query 2'],
          assetType: 'photo'
        }
      ]
    )
    assert.match(
      systemPromptOf(firstTurn),
      /Each beat comes with suggested queries\. Start with the first\. Use the others if its results are weak\./
    )
  })

  it('leaves the asset type out of the catalog when the mix allows one type', async () => {
    network.llm.tools([plan(1, 3)])
    endAfterBeatSplit()

    await runJob({ script: SCRIPT, mix: 'videos only' })

    const [, firstTurn] = network.llmRequests()
    for (const beat of catalogOf(firstTurn)) {
      assert.equal('assetType' in beat, false)
      assert.ok(Array.isArray(beat.queries))
    }
  })

  it('keeps the catalog the same on every turn', async () => {
    network.pexels.videos('first query 1', [video(101, 'city')])
    network.llm
      .tools([plan(3)])
      .tools([searchVideos('beat_1', 'first query 1')])
      .text('Done.')
      .text('Done.')
      .text('Done.')
      .text('Done.')

    await runJob({ script: SCRIPT })

    const [, first, second] = network.llmRequests()
    assert.deepEqual(catalogOf(second), catalogOf(first))
  })

  it('runs a saved job whose beats have no queries, and does not promise the model any', async () => {
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
    await applyTestSettings()
    const saved = await writeSavedJob({ status: 'paused', beats: [emptyBeat('beat_1')] })

    await invokeIpc('jobs:resume', saved.jobId)

    assert.deepEqual(network.problems, [])
    const { summary, manifest } = await readJob(saved.jobId)
    assert.equal(summary.status, 'completed')
    assert.equal('queries' in manifest.beats[0], false)
    const [firstTurn] = network.llmRequests()
    assert.doesNotMatch(systemPromptOf(firstTurn), /suggested queries/)
    const [beat] = catalogOf(firstTurn)
    assert.equal('queries' in beat, false)
    assert.equal('assetType' in beat, false)
  })

  it('still makes one request for the beat split of a one-sentence script', async () => {
    scriptOneBeatJob(network)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.summary.status, 'completed')
    assert.equal(network.llmRequests().length, 3)
  })
})
