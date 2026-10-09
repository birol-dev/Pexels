import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SUBMIT_BEAT_PLAN_TOOL,
  beatsFromPlan,
  buildBeatSplitUserMessage,
  missingBeatToolCallError,
  parseBeatPlanFromToolCall,
  splitScriptSentences,
  type BeatPlanItem
} from '../src/main/services/llm/beat-parse-tool.ts'

/** A plan item with the fields a test does not care about filled in. */
const item = (lastSentence: number, extra: Partial<BeatPlanItem> = {}): BeatPlanItem => ({
  lastSentence,
  visualPrompt: `picture ${lastSentence}`,
  queries: [`query ${lastSentence}`],
  assetType: 'either',
  ...extra
})

describe('SUBMIT_BEAT_PLAN_TOOL', () => {
  it('asks for where each beat ends and the footage to look for, not for the script text', () => {
    assert.equal(SUBMIT_BEAT_PLAN_TOOL.name, 'submit_beat_plan')
    assert.equal(SUBMIT_BEAT_PLAN_TOOL.parameters.type, 'object')
    assert.deepEqual(SUBMIT_BEAT_PLAN_TOOL.parameters.required, ['beats'])
    const { beats } = SUBMIT_BEAT_PLAN_TOOL.parameters.properties as {
      beats: {
        items: {
          properties: Record<string, { enum?: string[] }>
          required: string[]
        }
      }
    }
    assert.deepEqual(Object.keys(beats.items.properties), [
      'lastSentence',
      'visualPrompt',
      'queries',
      'assetType'
    ])
    assert.deepEqual(beats.items.required, ['lastSentence', 'visualPrompt', 'queries', 'assetType'])
    assert.deepEqual(beats.items.properties.assetType.enum, ['video', 'photo', 'either'])
  })
})

describe('parseBeatPlanFromToolCall', () => {
  it('reads the beat ends, prompts, queries and asset types', () => {
    const plan = parseBeatPlanFromToolCall(
      JSON.stringify({
        beats: [
          {
            lastSentence: 2,
            visualPrompt: 'swirling galaxy',
            queries: ['spiral galaxy', 'deep space'],
            assetType: 'video'
          },
          { lastSentence: 3, visualPrompt: 'astronaut helmet', queries: [], assetType: 'photo' }
        ]
      })
    )
    assert.deepEqual(plan, [
      {
        lastSentence: 2,
        visualPrompt: 'swirling galaxy',
        queries: ['spiral galaxy', 'deep space'],
        assetType: 'video'
      },
      { lastSentence: 3, visualPrompt: 'astronaut helmet', queries: [], assetType: 'photo' }
    ])
  })

  it('rejects invalid JSON', () => {
    assert.throws(() => parseBeatPlanFromToolCall('not json'), /not valid JSON/)
  })

  it('rejects a missing or empty beats array, and an item that is not an object', () => {
    assert.throws(() => parseBeatPlanFromToolCall('{}'), /missing "beats" array/)
    assert.throws(() => parseBeatPlanFromToolCall('{"beats":[]}'), /empty beats array/)
    assert.throws(() => parseBeatPlanFromToolCall('{"beats":["one"]}'), /index 0 is not an object/)
  })

  it('fills in what a beat leaves out instead of failing', () => {
    const [bare, odd] = parseBeatPlanFromToolCall(
      JSON.stringify({
        beats: [
          {},
          { lastSentence: '4', visualPrompt: 7, queries: ['ok', 3, null], assetType: 'gif' }
        ]
      })
    )
    assert.ok(Number.isNaN(bare.lastSentence))
    assert.deepEqual(
      { ...bare, lastSentence: 0 },
      {
        lastSentence: 0,
        visualPrompt: '',
        queries: [],
        assetType: 'either'
      }
    )
    assert.deepEqual(odd, {
      lastSentence: 4,
      visualPrompt: '',
      queries: ['ok'],
      assetType: 'either'
    })
  })
})

describe('splitScriptSentences', () => {
  it('splits at sentence punctuation', () => {
    assert.deepEqual(
      splitScriptSentences(
        'The market crashed overnight. Fortunes vanished! Did anyone see it coming?'
      ),
      ['The market crashed overnight.', 'Fortunes vanished!', 'Did anyone see it coming?']
    )
  })

  it('trims, drops empty pieces, and makes runs of whitespace one space', () => {
    assert.deepEqual(splitScriptSentences('  One   sentence here.\n\n  Another   one.  '), [
      'One sentence here.',
      'Another one.'
    ])
    assert.deepEqual(splitScriptSentences(''), [])
    assert.deepEqual(splitScriptSentences('   \n  '), [])
  })

  it('cuts a very long sentence into chunks of 15 words', () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i + 1}`)
    const chunks = splitScriptSentences(words.join(' '))
    assert.deepEqual(
      chunks.map((chunk) => chunk.split(' ').length),
      [15, 15, 15, 15, 15, 15, 10]
    )
    assert.equal(chunks.join(' '), words.join(' '))
  })

  it('keeps a sentence of exactly the limit whole, and cuts one word past it', () => {
    const forty = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
    assert.deepEqual(splitScriptSentences(forty), [forty])
    assert.equal(splitScriptSentences(`${forty} extra`).length, 3)
  })

  it('takes the limits as arguments', () => {
    assert.deepEqual(splitScriptSentences('a b c d e f g', 4, 3), ['a b c', 'd e f', 'g'])
  })

  it('splits scripts that are not in English', () => {
    assert.deepEqual(splitScriptSentences('שלום עולם. מה נשמע? הכול טוב!'), [
      'שלום עולם.',
      'מה נשמע?',
      'הכול טוב!'
    ])
    assert.deepEqual(splitScriptSentences('今日は晴れです。明日は雨です。'), [
      '今日は晴れです。',
      '明日は雨です。'
    ])
  })

  it('keeps a list marker with the sentence after it', () => {
    assert.deepEqual(splitScriptSentences('1. Intro. 2. Waves. 10. The end.'), [
      '1. Intro.',
      '2. Waves.',
      '10. The end.'
    ])
    assert.deepEqual(splitScriptSentences('1. Intro\n2. Waves\n3. End'), [
      '1. Intro',
      '2. Waves',
      '3. End'
    ])
    assert.deepEqual(splitScriptSentences('1) Intro. 2) Waves.'), ['1) Intro.', '2) Waves.'])
  })

  it('leaves a marker with nothing after it as a sentence of its own', () => {
    assert.deepEqual(splitScriptSentences('The end. 3.'), ['The end.', '3.'])
  })

  it('cuts a long sentence with no spaces into chunks of 60 characters', () => {
    const unbroken = 'x'.repeat(250)
    const chunks = splitScriptSentences(unbroken)
    assert.deepEqual(
      chunks.map((chunk) => chunk.length),
      [60, 60, 60, 60, 10]
    )
    assert.equal(chunks.join(''), unbroken)
  })

  it('keeps a sentence with no spaces whole up to 200 characters, and counts a character as a code point', () => {
    assert.deepEqual(splitScriptSentences('x'.repeat(200)), ['x'.repeat(200)])
    const rare = '\u{20000}'.repeat(201)
    const chunks = splitScriptSentences(rare)
    assert.deepEqual(
      chunks.map((chunk) => [...chunk].length),
      [60, 60, 60, 21]
    )
    assert.equal(chunks.join(''), rare)
  })

  it('ends a sentence at the full-width marks of Chinese and Japanese', () => {
    assert.deepEqual(splitScriptSentences('这是第一句。这是第二句！第三句？'), [
      '这是第一句。',
      '这是第二句！',
      '第三句？'
    ])
    assert.deepEqual(splitScriptSentences('今日は晴れです！明日は雨ですか？はい。'), [
      '今日は晴れです！',
      '明日は雨ですか？',
      'はい。'
    ])
  })

  it('may split after an abbreviation, and the words still come out in order', () => {
    const script = 'Dr. Smith went home. He slept at 3 p.m. and woke up.'
    assert.equal(splitScriptSentences(script).join(' '), script)
  })

  it('does not split inside a number', () => {
    assert.deepEqual(splitScriptSentences('Version 2.5 costs $3.50. Cheap!'), [
      'Version 2.5 costs $3.50.',
      'Cheap!'
    ])
  })
})

describe('buildBeatSplitUserMessage', () => {
  it('numbers the sentences from 1, one per line', () => {
    assert.equal(
      buildBeatSplitUserMessage(['The market crashed overnight.', 'Fortunes vanished.']),
      '[1] The market crashed overnight.\n[2] Fortunes vanished.'
    )
  })
})

describe('beatsFromPlan', () => {
  const sentences = ['S1.', 'S2.', 'S3.', 'S4.', 'S5.']
  const texts = (plan: BeatPlanItem[]): string[] =>
    beatsFromPlan(sentences, plan).beats.map((beat) => beat.text)

  it('cuts the sentences where the plan says, with nothing repaired', () => {
    const { beats, repaired } = beatsFromPlan(sentences, [item(2), item(3), item(5)])
    assert.deepEqual(
      beats.map((beat) => beat.text),
      ['S1. S2.', 'S3.', 'S4. S5.']
    )
    assert.equal(repaired, false)
  })

  it('carries the visual prompt, queries and asset type of each beat', () => {
    const { beats } = beatsFromPlan(sentences, [
      item(2, {
        visualPrompt: '  a dark harbor ',
        queries: [' harbor night ', ''],
        assetType: 'photo'
      }),
      item(5)
    ])
    assert.deepEqual(beats[0], {
      text: 'S1. S2.',
      visualPrompt: 'a dark harbor',
      queries: ['harbor night'],
      assetType: 'photo'
    })
    assert.equal(beats[1].assetType, 'either')
  })

  it('adds the sentences after the last beat to it when the plan ends early', () => {
    const result = beatsFromPlan(sentences, [item(1), item(2)])
    assert.deepEqual(
      result.beats.map((beat) => beat.text),
      ['S1.', 'S2. S3. S4. S5.']
    )
    assert.equal(result.repaired, true)
  })

  it('ends the last beat at the last sentence when the plan runs past it', () => {
    const result = beatsFromPlan(sentences, [item(3), item(9)])
    assert.deepEqual(
      result.beats.map((beat) => beat.text),
      ['S1. S2. S3.', 'S4. S5.']
    )
    assert.equal(result.repaired, true)
  })

  it('drops the beats that come after the last sentence is used', () => {
    const result = beatsFromPlan(sentences, [item(5), item(5), item(6)])
    assert.equal(result.beats.length, 1)
    assert.equal(result.beats[0].text, 'S1. S2. S3. S4. S5.')
    assert.equal(result.repaired, true)
  })

  it('gives a beat at least one sentence when the ends do not increase', () => {
    const result = beatsFromPlan(sentences, [item(3), item(2), item(2), item(5)])
    assert.deepEqual(
      result.beats.map((beat) => beat.text),
      ['S1. S2. S3.', 'S4.', 'S5.']
    )
    assert.equal(result.repaired, true)
  })

  it('treats zero, negative, fractional and missing ends as one sentence or the nearest end', () => {
    assert.deepEqual(texts([item(0), item(-4), item(5)]), ['S1.', 'S2.', 'S3. S4. S5.'])
    assert.deepEqual(texts([item(2.7), item(5)]), ['S1. S2.', 'S3. S4. S5.'])
    assert.deepEqual(texts([item(Number.NaN), item(Number.POSITIVE_INFINITY)]), [
      'S1.',
      'S2. S3. S4. S5.'
    ])
  })

  it('keeps at most 3 queries of a beat', () => {
    const [beat] = beatsFromPlan(sentences, [item(5, { queries: ['a', 'b', 'c', 'd', 'e'] })]).beats
    assert.deepEqual(beat.queries, ['a', 'b', 'c'])
  })

  it('searches a beat with no visual prompt by its first query, or by its own words', () => {
    const [byQuery, byText] = beatsFromPlan(sentences, [
      item(1, { visualPrompt: '  ', queries: ['empty street'] }),
      item(5, { visualPrompt: '', queries: [] })
    ]).beats
    assert.equal(byQuery.visualPrompt, 'empty street')
    assert.equal(byText.visualPrompt, 'S2. S3. S4. S5.')
  })

  it('makes no beats from no sentences', () => {
    assert.deepEqual(beatsFromPlan([], [item(1)]), { beats: [], repaired: true })
  })

  describe('for any plan', () => {
    /** mulberry32: a small seeded generator, so a failure can be reproduced. */
    function random(seed: number): () => number {
      let a = seed
      return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    it('gives beats that, joined, are exactly the sentences (200 random plans)', () => {
      const next = random(20240607)
      const wild = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 0.5]
      for (let run = 0; run < 200; run++) {
        const sentenceCount = 1 + Math.floor(next() * 30)
        const all = Array.from({ length: sentenceCount }, (_, i) => `Sentence ${i + 1}.`)
        const plan: BeatPlanItem[] = Array.from(
          { length: 1 + Math.floor(next() * 40) },
          (): BeatPlanItem =>
            item(
              next() < 0.1
                ? wild[Math.floor(next() * wild.length)]
                : Math.floor(next() * (sentenceCount + 8)) - 3
            )
        )

        const { beats } = beatsFromPlan(all, plan)

        const context = `run ${run}: ${sentenceCount} sentences, plan ${plan.map((p) => p.lastSentence).join(',')}`
        assert.equal(beats.map((beat) => beat.text).join(' '), all.join(' '), context)
        assert.ok(beats.length >= 1 && beats.length <= plan.length, context)
        for (const beat of beats) assert.ok(beat.text.length > 0, context)
      }
    })

    it('gives the same beats for the same plan', () => {
      const plan = [item(2), item(2), item(40), item(Number.NaN)]
      assert.deepEqual(beatsFromPlan(sentences, plan), beatsFromPlan(sentences, plan))
    })
  })
})

describe('missingBeatToolCallError', () => {
  it('explains when reasoning consumed the entire output budget', () => {
    const err = missingBeatToolCallError({
      stopReason: 'length',
      usage: { outputTokens: 4000, reasoningTokens: 4000 }
    })
    assert.match(err.message, /entire output token budget on reasoning/)
  })

  it('explains a generic output token limit when reasoning is unknown', () => {
    const err = missingBeatToolCallError({ stopReason: 'length' })
    assert.match(err.message, /hit the output token limit/)
  })

  it('keeps the generic structured-beats error for empty non-length replies', () => {
    const err = missingBeatToolCallError({ stopReason: 'final' })
    assert.match(err.message, /did not return structured beats/)
  })
})
