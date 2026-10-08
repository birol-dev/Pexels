import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { summarizePipelineRun, type SummaryBeat } from '../../src/main/services/pipeline/summary.ts'

const beat = (
  id: number,
  assets: number,
  tried: string[] = [],
  text = `Beat ${id}.`
): SummaryBeat => ({
  id: `beat_${id}`,
  text,
  assets,
  tried
})

describe('summarizePipelineRun', () => {
  it('names the beat without footage, its narration and the queries tried', () => {
    const beats = Array.from({ length: 15 }, (_, i) => beat(i + 1, 1))
    beats[8] = beat(9, 0, ['quantum particles', 'abstract light'], 'quantum entanglement')
    assert.equal(
      summarizePipelineRun({ beats, modelCalls: 6, totalTokens: 14200 }),
      '15 beats: 14 with footage, 1 without (beat_9 "quantum entanglement", tried: quantum particles, abstract light). 6 model calls, 14,200 tokens.'
    )
  })

  it('says all beats have footage when none is missing', () => {
    const beats = [beat(1, 1), beat(2, 2)]
    assert.equal(
      summarizePipelineRun({ beats, modelCalls: 2, totalTokens: 900 }),
      '2 beats: all with footage. 2 model calls, 900 tokens.'
    )
  })

  it('lists several beats without footage, separated by semicolons', () => {
    const beats = [beat(1, 0, ['a']), beat(2, 3), beat(3, 0, ['b', 'c'])]
    assert.equal(
      summarizePipelineRun({ beats, modelCalls: 1, totalTokens: 0 }),
      '3 beats: 1 with footage, 2 without (beat_1 "Beat 1.", tried: a; beat_3 "Beat 3.", tried: b, c). 1 model call.'
    )
  })

  it('says when no query was sent for a beat', () => {
    const text = summarizePipelineRun({ beats: [beat(1, 0)], modelCalls: 1, totalTokens: 0 })
    assert.match(text, /beat_1 "Beat 1\.", no query was sent\)/)
  })

  it('cuts a long narration and collapses its whitespace', () => {
    const long = `Waves   crash\n${'on the rocks '.repeat(20)}`
    const text = summarizePipelineRun({
      beats: [beat(1, 0, ['x'], long)],
      modelCalls: 1,
      totalTokens: 0
    })
    const quoted = /beat_1 "([^"]*)"/.exec(text)?.[1] ?? ''
    assert.ok(quoted.length <= 60)
    assert.ok(quoted.startsWith('Waves crash on the rocks'))
    assert.ok(quoted.endsWith('…'))
  })

  it('omits the tokens when the provider did not report any', () => {
    assert.equal(
      summarizePipelineRun({ beats: [beat(1, 1)], modelCalls: 3, totalTokens: 0 }),
      '1 beat: all with footage. 3 model calls.'
    )
  })

  it('handles a run with no beats', () => {
    assert.equal(
      summarizePipelineRun({ beats: [], modelCalls: 0, totalTokens: 0 }),
      '0 beats. 0 model calls.'
    )
  })
})
