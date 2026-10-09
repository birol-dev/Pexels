import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_RANKED_PER_BEAT,
  RANK_BATCH_SIZE,
  buildRankingUserContent,
  describeBeatForRanking,
  parseRankings,
  rankBeats
} from '../../src/main/services/pipeline/rank.ts'
import { describeCandidate } from '../../src/main/services/pipeline/context.ts'
import {
  beatIdsIn,
  fakeContext,
  offeredKeys,
  photoCand,
  pipelineBeat,
  videoCand,
  type FakeContext,
  type StructuredAnswer
} from '../support/pipeline-context.ts'

/** Beats beat_1..beat_n, each with `perBeat` candidates cached on the context. */
function setup(
  beatCount: number,
  perBeat: number,
  answer?: StructuredAnswer
): { fake: FakeContext; candidatesByBeat: Record<string, string[]> } {
  const beats = Array.from({ length: beatCount }, (_, i) => pipelineBeat(`beat_${i + 1}`))
  const fake = fakeContext({ beats, answer })
  const candidatesByBeat: Record<string, string[]> = {}
  beats.forEach((beat, b) => {
    const candidates = Array.from({ length: perBeat }, (_, i) =>
      videoCand(b * 100 + i + 1, `clip-${b + 1}-${i + 1}`)
    )
    fake.ctx.cacheCandidates(candidates)
    candidatesByBeat[beat.id] = candidates.map((c) => `video_${c.pexelsId}`)
  })
  return { fake, candidatesByBeat }
}

async function rank(
  fake: FakeContext,
  candidatesByBeat: Record<string, string[]>
): Promise<{ rankings: Record<string, string[]>; batches: number[] }> {
  const rankings: Record<string, string[]> = {}
  const batches: number[] = []
  await rankBeats(fake.ctx, fake.ctx.beats(), candidatesByBeat, (batch, modelCalls) => {
    Object.assign(rankings, batch)
    batches.push(modelCalls)
  })
  return { rankings, batches }
}

describe('parseRankings', () => {
  const offered = new Map([
    ['beat_1', new Set(['video_1', 'video_2', 'video_3'])],
    ['beat_2', new Set(['video_4'])]
  ])

  it('drops a key the beat was not offered', () => {
    const json = JSON.stringify({
      beats: [{ beatId: 'beat_1', ranked: ['video_2', 'video_4', 'video_99', 'video_1'] }]
    })
    assert.deepEqual(parseRankings(json, offered).get('beat_1'), ['video_2', 'video_1'])
  })

  it('allows an empty ranking, which says no candidate fits', () => {
    const json = JSON.stringify({ beats: [{ beatId: 'beat_1', ranked: [] }] })
    assert.deepEqual(parseRankings(json, offered).get('beat_1'), [])
  })

  it('leaves out a beat whose keys were all unrecognised, and names it, but keeps an empty list', () => {
    const json = JSON.stringify({
      beats: [
        { beatId: 'beat_1', ranked: ['1', '2', 3] },
        { beatId: 'beat_2', ranked: [] }
      ]
    })
    const unrecognised = new Set<string>()
    const result = parseRankings(json, offered, unrecognised)
    assert.equal(result.has('beat_1'), false)
    assert.deepEqual(result.get('beat_2'), [])
    assert.deepEqual([...unrecognised], ['beat_1'])
  })

  it('treats a missing or wrong-typed list as empty', () => {
    const json = JSON.stringify({
      beats: [{ beatId: 'beat_1' }, { beatId: 'beat_2', ranked: 'video_4' }]
    })
    const result = parseRankings(json, offered)
    assert.deepEqual(result.get('beat_1'), [])
    assert.deepEqual(result.get('beat_2'), [])
  })

  it('drops repeats and cuts the list to the most a beat may have', () => {
    const many = new Map([
      ['beat_1', new Set(Array.from({ length: 9 }, (_, i) => `video_${i + 1}`))]
    ])
    const json = JSON.stringify({
      beats: [
        {
          beatId: 'beat_1',
          ranked: ['video_1', 'video_1', ...Array.from({ length: 8 }, (_, i) => `video_${i + 2}`)]
        }
      ]
    })
    const ranked = parseRankings(json, many).get('beat_1')
    assert.equal(ranked?.length, MAX_RANKED_PER_BEAT)
    assert.deepEqual(ranked, ['video_1', 'video_2', 'video_3', 'video_4', 'video_5'])
  })

  it('leaves out a beat that was not asked about, and a beat the answer does not mention', () => {
    const json = JSON.stringify({ beats: [{ beatId: 'beat_7', ranked: ['video_1'] }] })
    const result = parseRankings(json, offered)
    assert.equal(result.size, 0)
  })

  it('ignores entries that are not objects', () => {
    const json = JSON.stringify({ beats: [null, 'beat_1', { beatId: 5, ranked: [] }] })
    assert.equal(parseRankings(json, offered).size, 0)
  })

  it('throws on arguments that are not JSON, or have no beats list', () => {
    assert.throws(() => parseRankings('{oops', offered), /not valid JSON/)
    assert.throws(() => parseRankings('{}', offered), /missing "beats" array/)
    assert.throws(() => parseRankings('null', offered), /missing "beats" array/)
  })
})

describe('describeBeatForRanking', () => {
  it('lists the narration, the visual prompt and each candidate with its description, shape and length', () => {
    const beat = pipelineBeat('beat_2', {
      text: 'Waves "crash" on the shore.',
      visualPrompt: 'Ocean waves'
    })
    const text = describeBeatForRanking(beat, [
      describeCandidate(videoCand(7, 'waves-on-a-beach', undefined, 12)),
      describeCandidate(photoCand(8, 'Sea foam', 3000, 3000))
    ])
    assert.equal(
      text,
      [
        'beat_2: "Waves \\"crash\\" on the shore."',
        'Visual prompt: Ocean waves',
        'Candidates:',
        '- video_7: waves on a beach, landscape, 12s',
        '- photo_8: Sea foam, square'
      ].join('\n')
    )
  })

  it('says so when Pexels gave a candidate no description', () => {
    const silent = photoCand(9, '')
    const text = describeBeatForRanking(pipelineBeat('beat_1'), [describeCandidate(silent)])
    assert.match(text, /- photo_9: no description, landscape/)
  })
})

describe('rankBeats', () => {
  it('splits 12 beats into 3 requests, 5 + 5 + 2, in beat order', async () => {
    const { fake, candidatesByBeat } = setup(12, 3)
    const { rankings, batches } = await rank(fake, candidatesByBeat)

    assert.equal(fake.requests.length, 3)
    assert.deepEqual(
      fake.requests.map((r) => beatIdsIn(r.userContent).length),
      [5, 5, 2]
    )
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), [
      'beat_1',
      'beat_2',
      'beat_3',
      'beat_4',
      'beat_5'
    ])
    assert.deepEqual(batches, [1, 1, 1])
    assert.equal(Object.keys(rankings).length, 12)
    assert.equal(RANK_BATCH_SIZE, 5)
  })

  it('sends one request for 5 beats and two for 6', async () => {
    const five = setup(5, 2)
    await rank(five.fake, five.candidatesByBeat)
    assert.equal(five.fake.requests.length, 1)

    const six = setup(6, 2)
    await rank(six.fake, six.candidatesByBeat)
    assert.equal(six.fake.requests.length, 2)
  })

  it('uses the same system prompt for every batch and names the tool', async () => {
    const { fake, candidatesByBeat } = setup(7, 2)
    await rank(fake, candidatesByBeat)
    assert.equal(new Set(fake.requests.map((r) => r.systemPrompt)).size, 1)
    assert.deepEqual([...new Set(fake.requests.map((r) => r.tool))], ['submit_rankings'])
  })

  it('needs no model for a beat with no candidates, and gives it an empty ranking', async () => {
    const { fake, candidatesByBeat } = setup(3, 2)
    candidatesByBeat.beat_2 = []
    const { rankings, batches } = await rank(fake, candidatesByBeat)

    assert.deepEqual(rankings.beat_2, [])
    assert.equal(fake.requests.length, 1)
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), ['beat_1', 'beat_3'])
    // The empty beat is reported with no model request behind it.
    assert.deepEqual(batches, [0, 1])
  })

  it('sends no request when no beat has a candidate', async () => {
    const { fake, candidatesByBeat } = setup(3, 0)
    const { rankings } = await rank(fake, candidatesByBeat)
    assert.equal(fake.requests.length, 0)
    assert.deepEqual(rankings, { beat_1: [], beat_2: [], beat_3: [] })
  })

  it('keeps the order the model gave', async () => {
    const { fake, candidatesByBeat } = setup(1, 3, (request) => {
      const keys = offeredKeys(request.userContent).get('beat_1') ?? []
      return { beats: [{ beatId: 'beat_1', ranked: [keys[2], keys[0]] }] }
    })
    const { rankings } = await rank(fake, candidatesByBeat)
    assert.deepEqual(rankings.beat_1, ['video_3', 'video_1'])
  })

  it('drops keys the beat was not offered', async () => {
    const { fake, candidatesByBeat } = setup(2, 2, () => ({
      beats: [
        { beatId: 'beat_1', ranked: ['video_101', 'video_1'] },
        { beatId: 'beat_2', ranked: ['video_102'] }
      ]
    }))
    const { rankings } = await rank(fake, candidatesByBeat)
    // video_101 was offered to beat_2 only, so beat_1 loses it.
    assert.deepEqual(rankings.beat_1, ['video_1'])
    assert.deepEqual(rankings.beat_2, ['video_102'])
  })

  it('allows an empty ranking and does not replace it with Pexels order', async () => {
    const { fake, candidatesByBeat } = setup(2, 2, () => ({
      beats: [
        { beatId: 'beat_1', ranked: [] },
        { beatId: 'beat_2', ranked: ['video_101'] }
      ]
    }))
    const { rankings } = await rank(fake, candidatesByBeat)
    assert.deepEqual(rankings.beat_1, [])
    assert.deepEqual(rankings.beat_2, ['video_101'])
  })

  it('gives a beat whose keys were all unrecognised the order Pexels gave, and says so once', async () => {
    const { fake, candidatesByBeat } = setup(2, 3, () => ({
      beats: [
        { beatId: 'beat_1', ranked: ['1', '2'] },
        { beatId: 'beat_2', ranked: [] }
      ]
    }))
    const { rankings } = await rank(fake, candidatesByBeat)
    assert.deepEqual(rankings.beat_1, ['video_1', 'video_2', 'video_3'])
    assert.deepEqual(rankings.beat_2, [], 'an empty list on purpose still says none fit')
    const about = fake.logs.filter((l) => l.message.includes('[beat_1]'))
    assert.equal(about.length, 1)
    assert.match(about[0].message, /keys for this beat were not recognised/)
    assert.ok(!fake.logs.some((l) => l.message.includes('[beat_2]')))
  })

  it('gives a beat the answer left out the order Pexels gave', async () => {
    const { fake, candidatesByBeat } = setup(2, 3, () => ({
      beats: [{ beatId: 'beat_1', ranked: ['video_2'] }]
    }))
    const { rankings } = await rank(fake, candidatesByBeat)
    assert.deepEqual(rankings.beat_1, ['video_2'])
    assert.deepEqual(rankings.beat_2, ['video_101', 'video_102', 'video_103'])
    assert.ok(fake.logs.some((l) => l.message.includes('[beat_2] The ranking left this beat out')))
  })

  it('falls back to the order Pexels gave for a batch that failed, and ranks the others', async () => {
    const { fake, candidatesByBeat } = setup(7, 2, (request, call) => {
      if (call === 1) throw new Error('model said no')
      return {
        beats: [...offeredKeys(request.userContent)].map(([beatId, keys]) => ({
          beatId,
          ranked: [...keys].reverse()
        }))
      }
    })
    const { rankings } = await rank(fake, candidatesByBeat)

    assert.equal(fake.requests.length, 2)
    // Batch 1 failed: beat_1 keeps Pexels order. Batch 2 reversed beat_6's keys.
    assert.deepEqual(rankings.beat_1, ['video_1', 'video_2'])
    assert.deepEqual(rankings.beat_6, ['video_502', 'video_501'])
    assert.ok(
      fake.logs.some((l) => l.type === 'error' && l.message.includes('Ranking batch 1 of 2 failed'))
    )
  })

  it('stops with the error when the job was paused or cancelled', async () => {
    const { fake, candidatesByBeat } = setup(12, 2, () => {
      fake.controller.abort(new Error('paused'))
      throw new Error('aborted')
    })
    await assert.rejects(rank(fake, candidatesByBeat), /aborted|paused/)
    // The batches after the abort never start, and the abort is not logged as a failed batch.
    assert.equal(fake.requests.length, 1)
    assert.equal(fake.logs.filter((l) => l.type === 'error').length, 0)
  })

  it('keeps the batches that landed when a later one is stopped', async () => {
    const { fake, candidatesByBeat } = setup(6, 2)
    const seen: Record<string, string[]> = {}
    fake.ctx.callStructured = async (request) => {
      fake.requests.push({
        tool: request.tool.name,
        systemPrompt: request.systemPrompt,
        userContent: request.userContent
      })
      if (fake.requests.length === 2) {
        fake.controller.abort(new Error('paused'))
        throw new Error('paused')
      }
      return request.parse(
        JSON.stringify({
          beats: [...offeredKeys(request.userContent)].map(([beatId, ranked]) => ({
            beatId,
            ranked
          }))
        })
      )
    }
    await assert.rejects(
      rankBeats(fake.ctx, fake.ctx.beats(), candidatesByBeat, (batch) =>
        Object.assign(seen, batch)
      ),
      /paused/
    )
    assert.deepEqual(Object.keys(seen).sort(), ['beat_1', 'beat_2', 'beat_3', 'beat_4', 'beat_5'])
  })

  it('builds the user message from every beat in the batch', () => {
    const beats = [pipelineBeat('beat_1'), pipelineBeat('beat_2')]
    const content = buildRankingUserContent(
      beats.map((beat, i) => ({
        beat,
        candidates: [describeCandidate(videoCand(i + 1, 'a-clip'))]
      }))
    )
    assert.deepEqual(beatIdsIn(content), ['beat_1', 'beat_2'])
  })
})
