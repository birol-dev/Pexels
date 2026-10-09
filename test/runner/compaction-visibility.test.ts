import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo } from '../support/pexels-fixtures.ts'
import { resetNetworkState, runJob, searchPhotos, submitBeats } from '../support/run-job.ts'

const BEAT_COUNT = 10
const LEAD_SEARCHES = 3
const COMPACT_THRESHOLD = 4000

describe('runner: what the model sees after a turn of many searches', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('gets every search result of the previous turn in full while older turns are compacted', async () => {
    const sentences = Array.from({ length: BEAT_COUNT }, (_, i) => `Sentence number ${i + 1}.`)
    const alt = 'Detailed description. '.repeat(40).slice(0, 600)

    // Three single-search turns of about 67,000 characters each carry the conversation
    // to the edge of the 160,000-character budget (the first turns are never compacted).
    const leadQueries = Array.from({ length: LEAD_SEARCHES }, (_, n) => `lead query ${n + 1}`)
    leadQueries.forEach((query, n) =>
      network.pexels.photos(
        query,
        Array.from({ length: 100 }, (_, i) => photo(1000 * (n + 1) + i, alt))
      )
    )
    // Then one turn searches for every beat at once. Ten photos make each of its results
    // larger than the compaction threshold, so only the newest-turns rule keeps them whole.
    const queries = sentences.map((_, i) => `query number ${i + 1}`)
    queries.forEach((query, i) =>
      network.pexels.photos(
        query,
        Array.from({ length: 10 }, (_, n) => photo(10_000 + i * 10 + n, alt))
      )
    )

    network.llm.tools([submitBeats(sentences)])
    for (const query of leadQueries) network.llm.tools([searchPhotos('beat_1', query)])
    network.llm
      .tools(queries.map((query, i) => searchPhotos(`beat_${i + 1}`, query)))
      // The model then stops calling tools; three nudges later the loop gives up.
      .text('Done.')
      .text('Done.')
      .text('Done.')
      .text('Done.')

    await runJob({ script: sentences.join(' '), maxTotalDownloads: 20 })

    assert.deepEqual(network.problems, [])
    const results = network
      .llmRequests()
      [LEAD_SEARCHES + 2].messages.filter((message) => message.role === 'tool')
      .map((message) => message.content || '')
    assert.equal(results.length, LEAD_SEARCHES + BEAT_COUNT)

    // The oldest turn is a digest, so the run really went through compaction.
    const [oldest, ...newer] = results
    assert.equal((JSON.parse(oldest) as { compacted?: boolean }).compacted, true)

    // Everything after it, the whole newest turn included, reaches the model untouched.
    const newestTurn = newer.slice(-BEAT_COUNT)
    for (const [index, content] of newer.entries()) {
      assert.doesNotMatch(content, /"compacted":true/, `result ${index + 2} was trimmed`)
    }
    for (const [index, content] of newestTurn.entries()) {
      assert.ok(
        content.length > COMPACT_THRESHOLD,
        `the result of search ${index + 1} would have been compacted if it were older`
      )
    }
  })
})
