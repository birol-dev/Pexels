import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_BROADER_QUERIES,
  beatsNeedingBroaderQueries,
  broadenQueries,
  buildBroaderQueriesUserContent,
  describeBeatForBroadening,
  parseBroaderQueries
} from '../../src/main/services/pipeline/broaden.ts'
import { beatIdsIn, fakeContext, pipelineBeat } from '../support/pipeline-context.ts'

describe('beatsNeedingBroaderQueries', () => {
  const beats = [
    pipelineBeat('beat_1', { held: ['video_1'] }),
    pipelineBeat('beat_2'),
    pipelineBeat('beat_3'),
    pipelineBeat('beat_4', { excluded: ['video_4'] }),
    pipelineBeat('beat_5')
  ]
  const ranking = {
    beat_1: ['video_1'],
    beat_2: [],
    beat_3: ['video_3'],
    beat_4: ['video_4'],
    beat_5: ['video_1']
  }

  it('picks the beats with no asset and no candidate left to give them', () => {
    // beat_1 has an asset. beat_3 still has video_3. beat_2 ranked nothing, beat_4's only pick is
    // excluded, and beat_5's only pick is held by beat_1.
    assert.deepEqual(
      beatsNeedingBroaderQueries(beats, ranking).map((b) => b.id),
      ['beat_2', 'beat_4', 'beat_5']
    )
  })

  it('does not pick a beat the cap left without footage while candidates remain for it', () => {
    const left = [pipelineBeat('beat_1'), pipelineBeat('beat_2')]
    assert.deepEqual(
      beatsNeedingBroaderQueries(left, { beat_1: ['video_1'], beat_2: ['video_2'] }),
      []
    )
  })

  it('treats a beat with no ranking at all as having nothing', () => {
    assert.deepEqual(
      beatsNeedingBroaderQueries([pipelineBeat('beat_1')], {}).map((b) => b.id),
      ['beat_1']
    )
  })

  it('leaves out a beat that was searched again already', () => {
    assert.deepEqual(
      beatsNeedingBroaderQueries(beats, ranking, ['beat_2', 'beat_4']).map((b) => b.id),
      ['beat_5']
    )
  })
})

describe('parseBroaderQueries', () => {
  const asked = new Set(['beat_1', 'beat_2'])

  it('keeps up to three trimmed queries per beat, without repeats', () => {
    const json = JSON.stringify({
      beats: [
        {
          beatId: 'beat_1',
          queries: [' ocean ', 'Ocean', 'sea waves', 'beach', 'sunset sky']
        }
      ]
    })
    assert.deepEqual(parseBroaderQueries(json, asked).get('beat_1'), [
      'ocean',
      'sea waves',
      'beach'
    ])
    assert.equal(MAX_BROADER_QUERIES, 3)
  })

  it('drops a beat that was not asked about, and queries that are not text or too short', () => {
    const json = JSON.stringify({
      beats: [
        { beatId: 'beat_9', queries: ['ocean'] },
        { beatId: 'beat_1', queries: [5, 'a', '', 'forest'] },
        { beatId: 'beat_2', queries: ['x'] }
      ]
    })
    const result = parseBroaderQueries(json, asked)
    assert.deepEqual([...result.keys()], ['beat_1'])
    assert.deepEqual(result.get('beat_1'), ['forest'])
  })

  it('drops a query the safety setting blocks', () => {
    const json = JSON.stringify({ beats: [{ beatId: 'beat_1', queries: ['sexy beach', 'beach'] }] })
    const result = parseBroaderQueries(json, asked, (query) => query.includes('sexy'))
    assert.deepEqual(result.get('beat_1'), ['beach'])
  })

  it('throws on arguments that are not JSON, or have no beats list', () => {
    assert.throws(() => parseBroaderQueries('nope', asked), /not valid JSON/)
    assert.throws(() => parseBroaderQueries('{"beats": 3}', asked), /missing "beats" array/)
  })
})

describe('describeBeatForBroadening', () => {
  it('lists the narration, the visual prompt and the queries tried', () => {
    const beat = pipelineBeat('beat_9', {
      text: 'Quantum entanglement links two particles.',
      visualPrompt: 'Glowing particles',
      tried: ['quantum particles', 'abstract light']
    })
    assert.equal(
      describeBeatForBroadening(beat),
      [
        'beat_9: "Quantum entanglement links two particles."',
        'Visual prompt: Glowing particles',
        'Tried: quantum particles, abstract light'
      ].join('\n')
    )
  })

  it('says so when nothing was tried', () => {
    assert.match(describeBeatForBroadening(pipelineBeat('beat_1')), /Tried: nothing$/)
  })

  it('separates beats with a blank line', () => {
    const content = buildBroaderQueriesUserContent([pipelineBeat('beat_1'), pipelineBeat('beat_2')])
    assert.deepEqual(beatIdsIn(content), ['beat_1', 'beat_2'])
    assert.match(content, /\n\nbeat_2: /)
  })
})

describe('broadenQueries', () => {
  it('sends one request for all the beats given, and only those', async () => {
    const beats = [
      pipelineBeat('beat_2', { tried: ['query beat_2'] }),
      pipelineBeat('beat_5', { tried: ['query beat_5'] })
    ]
    const fake = fakeContext({ beats })
    const result = await broadenQueries(fake.ctx, beats)

    assert.equal(fake.requests.length, 1)
    assert.equal(fake.requests[0].tool, 'submit_broader_queries')
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), ['beat_2', 'beat_5'])
    assert.deepEqual(result, { beat_2: ['broader beat_2'], beat_5: ['broader beat_5'] })
  })

  it('sends no request when there are no beats', async () => {
    const fake = fakeContext({ beats: [] })
    assert.deepEqual(await broadenQueries(fake.ctx, []), {})
    assert.equal(fake.requests.length, 0)
  })

  it('drops a query the beat already tried', async () => {
    const beats = [pipelineBeat('beat_1', { tried: ['Ocean waves'] })]
    const fake = fakeContext({
      beats,
      answer: () => ({
        beats: [{ beatId: 'beat_1', queries: ['ocean waves', 'sea', 'shore'] }]
      })
    })
    assert.deepEqual(await broadenQueries(fake.ctx, beats), { beat_1: ['sea', 'shore'] })
  })

  it('leaves out a beat the model gave no usable query for', async () => {
    const beats = [pipelineBeat('beat_1'), pipelineBeat('beat_2')]
    const fake = fakeContext({
      beats,
      answer: () => ({ beats: [{ beatId: 'beat_2', queries: ['forest'] }] })
    })
    assert.deepEqual(await broadenQueries(fake.ctx, beats), { beat_2: ['forest'] })
  })

  it('logs a failed request and gives no queries, so the job goes on', async () => {
    const beats = [pipelineBeat('beat_1'), pipelineBeat('beat_2')]
    const fake = fakeContext({
      beats,
      answer: () => {
        throw new Error('model said no')
      }
    })
    assert.deepEqual(await broadenQueries(fake.ctx, beats), {})
    assert.ok(
      fake.logs.some(
        (l) =>
          l.type === 'error' &&
          l.message.includes('2 beats stay without footage') &&
          l.message.includes('model said no')
      )
    )
  })

  it('throws when the job was paused or cancelled instead of logging', async () => {
    const beats = [pipelineBeat('beat_1')]
    const fake = fakeContext({ beats })
    fake.controller.abort(new Error('paused'))
    await assert.rejects(broadenQueries(fake.ctx, beats), /paused/)
    assert.equal(fake.logs.length, 0)
  })

  it('does not send a query the skip explicit setting blocks', async () => {
    const beats = [pipelineBeat('beat_1')]
    const fake = fakeContext({
      beats,
      answer: () => ({ beats: [{ beatId: 'beat_1', queries: ['nude beach', 'beach'] }] })
    })
    assert.deepEqual(await broadenQueries(fake.ctx, beats), { beat_1: ['beach'] })
  })
})
