import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planBeats } from '../../src/main/services/pipeline/plan-beats.ts'
import type { StructuredRequest } from '../../src/main/services/llm/structured-request.ts'

const SCRIPT = 'Waves crash on the shore. Gulls circle above. The tide turns at dusk.'

function context(reply: unknown): {
  ctx: Parameters<typeof planBeats>[0]
  requests: StructuredRequest<unknown>[]
  logs: string[]
} {
  const requests: StructuredRequest<unknown>[] = []
  const logs: string[] = []
  return {
    requests,
    logs,
    ctx: {
      async callStructured<T>(request: StructuredRequest<T>): Promise<T> {
        requests.push(request as StructuredRequest<unknown>)
        return request.parse(JSON.stringify(reply))
      },
      log: (_type, message) => {
        logs.push(message)
      }
    }
  }
}

const input = { script: SCRIPT, maxTotalDownloads: 10, avoidPeople: false, style: 'cinematic' }

describe('planBeats', () => {
  it('sends the numbered sentences in one request and cuts the beats from the script', async () => {
    const { ctx, requests, logs } = context({
      beats: [
        {
          lastSentence: 2,
          visualPrompt: 'Waves and gulls',
          queries: ['ocean waves', 'seagulls'],
          assetType: 'video'
        },
        { lastSentence: 3, visualPrompt: 'Dusk tide', queries: ['sunset sea'], assetType: 'either' }
      ]
    })
    const beats = await planBeats(ctx, input)

    assert.equal(requests.length, 1)
    assert.equal(requests[0].tool.name, 'submit_beat_plan')
    assert.match(
      requests[0].userContent,
      /^\[1\] Waves crash on the shore\.\n\[2\] Gulls circle above\./
    )
    assert.deepEqual(
      beats.map((b) => b.text),
      ['Waves crash on the shore. Gulls circle above.', 'The tide turns at dusk.']
    )
    assert.deepEqual(logs, [])
  })

  it('throws before any request when the script has no sentences', async () => {
    const { ctx, requests } = context({ beats: [] })
    await assert.rejects(planBeats(ctx, { ...input, script: '   ' }), /the script has no sentences/)
    assert.equal(requests.length, 0)
  })

  it('warns when the plan has more beats than the download cap', async () => {
    const { ctx, logs } = context({
      beats: [
        { lastSentence: 1, visualPrompt: 'a', queries: ['a b'], assetType: 'video' },
        { lastSentence: 2, visualPrompt: 'b', queries: ['b c'], assetType: 'video' },
        { lastSentence: 3, visualPrompt: 'c', queries: ['c d'], assetType: 'video' }
      ]
    })
    await planBeats(ctx, { ...input, maxTotalDownloads: 2 })
    assert.ok(logs.some((l) => l.includes('3 beats but the download cap is 2')))
  })

  it('says so when it had to adjust where the beats end', async () => {
    const { ctx, logs } = context({
      beats: [{ lastSentence: 1, visualPrompt: 'a', queries: ['a b'], assetType: 'video' }]
    })
    const beats = await planBeats(ctx, input)
    // The plan ended at sentence 1 but the script has 3, so the last beat is stretched to the end.
    assert.equal(beats.at(-1)?.text.endsWith('The tide turns at dusk.'), true)
    assert.ok(logs.some((l) => l.includes('did not end each beat at a sentence of the script')))
  })
})
