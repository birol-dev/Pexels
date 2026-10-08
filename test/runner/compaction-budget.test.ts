import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo } from '../support/pexels-fixtures.ts'
import {
  resetNetworkState,
  runJob,
  searchPhotos,
  select,
  submitBeats,
  type JobRun
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT } from '../support/scenarios.ts'

const SEARCHES = 4
const COMPACTED_LOG = 'Compacted older search results to keep requests small.'

describe('runner: older results are compacted only when the context budget is crossed', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  /**
   * One beat that searches `SEARCHES` times, one search per turn, then picks the first
   * photo of the first search. Search `n` finds `perSearch` photos with ids from `n * 1000`.
   */
  function scriptSearchesThenSelect(perSearch: number, altLength: number): void {
    for (let n = 1; n <= SEARCHES; n++) {
      network.pexels.photos(
        `query ${n}`,
        Array.from({ length: perSearch }, (_, i) =>
          photo(n * 1000 + i, 'Detailed description. '.repeat(40).slice(0, altLength))
        )
      )
    }
    network.llm.tools([submitBeats([ONE_BEAT_SCRIPT])])
    for (let n = 1; n <= SEARCHES; n++) network.llm.tools([searchPhotos('beat_1', `query ${n}`)])
    network.llm.tools([select([{ beatId: 'beat_1', assetType: 'photo', pexelsId: 1000 }])])
  }

  /** The tool results the model was sent with its request number `request` (0 is the beat split). */
  function resultsSentWith(request: number): string[] {
    return network
      .llmRequests()
      [request].messages.filter((message) => message.role === 'tool')
      .map((message) => message.content || '')
  }

  async function agentState(run: JobRun): Promise<{ compactedBefore?: number }> {
    return JSON.parse(await readFile(join(run.summary.downloadPath, 'agent-state.json'), 'utf8'))
  }

  it('keeps every result in full while the conversation fits', async () => {
    // Four results of about 8,000 characters are each above the 4,000 threshold, and
    // together far below the budget.
    scriptSearchesThenSelect(30, 200)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')
    const results = resultsSentWith(SEARCHES + 1)
    assert.equal(results.length, SEARCHES)
    assert.ok(results.every((content) => content.length > 4000))
    for (const content of results) assert.doesNotMatch(content, /"compacted":true/)
    assert.ok(!run.snapshot.logs.some((entry) => entry.message === COMPACTED_LOG))
    assert.equal((await agentState(run)).compactedBefore, 0)
  })

  it('digests the oldest result once the budget is crossed, and the model can still select from it', async () => {
    // Four results of about 67,000 characters pass the 160,000 budget on the fifth request.
    scriptSearchesThenSelect(100, 600)

    const run = await runJob({ script: ONE_BEAT_SCRIPT })

    assert.deepEqual(network.problems, [])
    assert.equal(run.snapshot.status, 'completed')

    // Three turns are always sent whole, so the fourth request is still untouched.
    for (const content of resultsSentWith(SEARCHES)) {
      assert.doesNotMatch(content, /"compacted":true/)
    }

    // The fifth crosses the budget: the oldest turn is a digest, the newest three are whole.
    const [oldest, ...newest] = resultsSentWith(SEARCHES + 1)
    const digest = JSON.parse(oldest) as { compacted: boolean; results: Array<[number, string]> }
    assert.equal(digest.compacted, true)
    assert.equal(digest.results.length, 100)
    assert.equal(digest.results[0][0], 1000)
    assert.equal(newest.length, SEARCHES - 1)
    for (const content of newest) assert.doesNotMatch(content, /"compacted":true/)

    // The digest names every result, and a result seen only as a digest can be selected.
    assert.equal(run.manifest.beats[0].assets[0].pexelsId, 1000)
    assert.equal(run.manifest.beats[0].assets[0].status, 'completed')

    const notices = run.snapshot.logs.filter((entry) => entry.message === COMPACTED_LOG)
    assert.equal(notices.length, 1)
    assert.ok(
      ((await agentState(run)).compactedBefore ?? 0) > 0,
      'the cutoff is saved with the job'
    )
  })
})
