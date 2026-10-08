import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { video } from '../support/pexels-fixtures.ts'
import { resetNetworkState, runJob, searchVideos, submitBeats } from '../support/run-job.ts'

const BEAT_COUNT = 10

describe('runner: what the model sees after a turn of many searches', () => {
  let network: FakeNetwork

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it(
    'gets every search result of the previous turn in full',
    { todo: 'plan 05 phase 1' },
    async () => {
      const sentences = Array.from({ length: BEAT_COUNT }, (_, i) => `Sentence number ${i + 1}.`)
      const queries = sentences.map((_, i) => `query number ${i + 1}`)
      // Ten clips per search makes each result larger than the compaction threshold.
      queries.forEach((query, i) =>
        network.pexels.videos(
          query,
          Array.from({ length: 10 }, (_, n) => video(1000 + i * 10 + n, `clip-${i}-${n}`))
        )
      )

      network.llm
        .tools([submitBeats(sentences)])
        .tools(queries.map((query, i) => searchVideos(`beat_${i + 1}`, query)))
        // The model then stops calling tools; three nudges later the loop gives up.
        .text('Done.')
        .text('Done.')
        .text('Done.')
        .text('Done.')

      await runJob({ script: sentences.join(' '), maxTotalDownloads: 20 })

      assert.deepEqual(network.problems, [])
      const secondTurn = network.llmRequests()[2]
      const results = secondTurn.messages.filter((message) => message.role === 'tool')
      assert.equal(results.length, BEAT_COUNT)
      for (const [index, result] of results.entries()) {
        assert.doesNotMatch(
          result.content || '',
          /"omitted":true/,
          `the result of search ${index + 1} was trimmed before the model could read it`
        )
      }
    }
  )
})
