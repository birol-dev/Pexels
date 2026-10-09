import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PexelsCandidate } from '../../src/main/services/pexels/candidates.ts'
import {
  MAX_RANKED_PER_BEAT,
  RANK_BATCH_SIZE,
  RANK_THUMBNAILS_PER_BEAT,
  buildRankingUserContent,
  describeBeatForRanking,
  parseRankings,
  rankBeats
} from '../../src/main/services/pipeline/rank.ts'
import {
  describeCandidate,
  type PipelineSettings
} from '../../src/main/services/pipeline/context.ts'
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

/** The system prompt of a ranking request before thumbnails existed, for a "Cinematic" job. */
const PROMPT_BEFORE_THUMBNAILS = [
  'Choose stock footage for the beats of a narrated video. The user message lists each beat with its narration, its visual prompt, and the Pexels candidates found for it. Each candidate has a key, a description, its shape, and for a video its length in seconds.',
  '',
  'Rules:',
  '1. You cannot see the footage. Judge each candidate by its description, which is the alt text or the page slug Pexels gives it.',
  "2. For each beat, list the keys of the candidates that fit it, best first, at most 5. Prefer candidates that show the beat's subject and action. Candidates are listed in Pexels' own relevance order, so when several look equally good, prefer the earlier ones.",
  "3. Leave a beat's list empty when none of its candidates fit. Do not list a poor match to fill the list.",
  '4. Use only the keys listed under that beat.',
  '5. Prefer variety within the batch: when two beats could use similar clips, give them different ones.',
  '',
  'Visual style: Cinematic. The user describes the style as: "Cinematic".',
  'Rank the candidates that fit this look first.',
  '',
  'Call submit_rankings once, with every beat of the user message.'
].join('\n')

/** The user message of a ranking request before thumbnails existed: two beats of two clips. */
const USER_CONTENT_BEFORE_THUMBNAILS = [
  'beat_1: "Narration of beat_1."',
  'Visual prompt: Footage for beat_1',
  'Candidates:',
  '- video_1: clip 1 1, landscape, 12s',
  '- video_2: clip 1 2, landscape, 12s',
  '',
  'beat_2: "Narration of beat_2."',
  'Visual prompt: Footage for beat_2',
  'Candidates:',
  '- video_101: clip 2 1, landscape, 12s',
  '- video_102: clip 2 2, landscape, 12s'
].join('\n')

/** A video candidate's thumbnail as the ranking attaches it. */
const tinyOf = (id: number): string =>
  `https://images.pexels.com/videos/${id}/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280`

/** The candidate keys a user message lists as attached thumbnails, in the order it states. */
function thumbnailOrder(userContent: string): string[] {
  return [...userContent.matchAll(/^Thumbnail (\d+) = (\S+)$/gm)].map((match, index) => {
    assert.equal(Number(match[1]), index + 1, 'the thumbnails are numbered from 1 without gaps')
    return match[2]
  })
}

/** Beats beat_1..beat_n with the candidates given for each, cached on a context with these settings. */
function setupCandidates(
  candidatesPerBeat: PexelsCandidate[][],
  settings: Partial<PipelineSettings> = {}
): { fake: FakeContext; candidatesByBeat: Record<string, string[]> } {
  const beats = candidatesPerBeat.map((_, i) => pipelineBeat(`beat_${i + 1}`))
  const fake = fakeContext({ beats, settings })
  const candidatesByBeat: Record<string, string[]> = {}
  beats.forEach((beat, b) => {
    fake.ctx.cacheCandidates(candidatesPerBeat[b])
    candidatesByBeat[beat.id] = candidatesPerBeat[b].map((c) => `${c.type}_${c.pexelsId}`)
  })
  return { fake, candidatesByBeat }
}

/** `count` video candidates for each of `beatCount` beats, with ids beat * 100 + 1.. as in setup(). */
function clipsPerBeat(beatCount: number, count: number): PexelsCandidate[][] {
  return Array.from({ length: beatCount }, (_, b) =>
    Array.from({ length: count }, (_, i) => videoCand(b * 100 + i + 1, `clip-${b + 1}-${i + 1}`))
  )
}

describe('rankBeats with thumbnails', () => {
  const ON = { rankWithThumbnails: true }

  describe('off, which is the default', () => {
    it('sends the request it sent before thumbnails existed: the same texts and no images', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(2, 2))
      await rank(fake, candidatesByBeat)

      assert.equal(fake.requests.length, 1)
      assert.equal(fake.requests[0].systemPrompt, PROMPT_BEFORE_THUMBNAILS)
      assert.equal(fake.requests[0].userContent, USER_CONTENT_BEFORE_THUMBNAILS)
      assert.ok(!('images' in fake.requests[0]), 'the request has no images')
    })

    it('sends no images however many candidates a beat has', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(6, 12), {
        rankWithThumbnails: false
      })
      await rank(fake, candidatesByBeat)

      assert.equal(fake.requests.length, 2)
      for (const request of fake.requests) {
        assert.ok(!('images' in request))
        assert.ok(!/thumbnail/i.test(request.userContent))
        assert.equal(request.systemPrompt, PROMPT_BEFORE_THUMBNAILS)
      }
    })
  })

  describe('on', () => {
    it('attaches each candidate thumbnail, and states the order of the images by candidate key', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(2, 3), ON)
      const { rankings } = await rank(fake, candidatesByBeat)

      assert.equal(fake.requests.length, 1)
      const { images, userContent } = fake.requests[0]
      const order = thumbnailOrder(userContent)
      assert.deepEqual(order, [
        'video_1',
        'video_2',
        'video_3',
        'video_101',
        'video_102',
        'video_103'
      ])
      assert.deepEqual(
        images?.map((image) => image.url),
        [1, 2, 3, 101, 102, 103].map(tinyOf)
      )
      // The nth image is the thumbnail of the nth key the message states.
      order.forEach((key, i) => {
        const candidate = fake.ctx.candidate(key)
        assert.equal(images?.[i].url, candidate && describeCandidate(candidate).thumbnailUrl, key)
      })
      assert.deepEqual(Object.keys(rankings), ['beat_1', 'beat_2'])
    })

    it('keeps the beats and their candidates in the text as they were, and adds the order after them', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(2, 2), ON)
      await rank(fake, candidatesByBeat)

      const { userContent } = fake.requests[0]
      assert.ok(userContent.startsWith(`${USER_CONTENT_BEFORE_THUMBNAILS}\n\n`))
      const order = userContent.slice(USER_CONTENT_BEFORE_THUMBNAILS.length + 2)
      assert.equal(
        order,
        [
          'Thumbnails are attached to this message in this order, and a candidate not listed has none:',
          'Thumbnail 1 = video_1',
          'Thumbnail 2 = video_2',
          'Thumbnail 3 = video_101',
          'Thumbnail 4 = video_102'
        ].join('\n')
      )
    })

    it('tells the model it can look at the thumbnails, and keeps the other rules', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(1, 2), ON)
      await rank(fake, candidatesByBeat)

      const { systemPrompt } = fake.requests[0]
      assert.ok(!systemPrompt.includes('You cannot see the footage'))
      assert.match(systemPrompt, /^1\. .*thumbnail/im)
      for (const rule of PROMPT_BEFORE_THUMBNAILS.split('\n').slice(4)) {
        assert.ok(systemPrompt.includes(rule), rule)
      }
    })

    it('attaches at most RANK_THUMBNAILS_PER_BEAT thumbnails for a beat, the first ones, and lists every candidate', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(1, 12), ON)
      await rank(fake, candidatesByBeat)

      assert.equal(RANK_THUMBNAILS_PER_BEAT, 8)
      const { images, userContent } = fake.requests[0]
      assert.equal(images?.length, RANK_THUMBNAILS_PER_BEAT)
      assert.deepEqual(
        thumbnailOrder(userContent),
        candidatesByBeat.beat_1.slice(0, RANK_THUMBNAILS_PER_BEAT)
      )
      assert.deepEqual(offeredKeys(userContent).get('beat_1'), candidatesByBeat.beat_1)
    })

    it('applies the cap to each beat of a batch, not to the batch', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(RANK_BATCH_SIZE, 12), ON)
      await rank(fake, candidatesByBeat)

      const { images, userContent } = fake.requests[0]
      assert.equal(images?.length, RANK_BATCH_SIZE * RANK_THUMBNAILS_PER_BEAT)
      const expected = Object.values(candidatesByBeat).flatMap((keys) =>
        keys.slice(0, RANK_THUMBNAILS_PER_BEAT)
      )
      assert.deepEqual(thumbnailOrder(userContent), expected)
    })

    it('numbers the thumbnails again from 1 in each batch', async () => {
      const { fake, candidatesByBeat } = setupCandidates(clipsPerBeat(6, 2), ON)
      await rank(fake, candidatesByBeat)

      assert.equal(fake.requests.length, 2)
      assert.equal(fake.requests[0].images?.length, 10)
      assert.equal(fake.requests[1].images?.length, 2)
      assert.deepEqual(thumbnailOrder(fake.requests[1].userContent), ['video_501', 'video_502'])
    })

    it('still lists a candidate with no thumbnail, and ranks it from its description', async () => {
      const [first] = clipsPerBeat(1, 4)
      const noPreview = { ...first[1], imageUrl: '' }
      const { fake, candidatesByBeat } = setupCandidates(
        [[first[0], noPreview, first[2], first[3]]],
        ON
      )
      const { rankings } = await rank(fake, candidatesByBeat)

      const { images, userContent } = fake.requests[0]
      assert.deepEqual(thumbnailOrder(userContent), ['video_1', 'video_3', 'video_4'])
      assert.deepEqual(
        images?.map((image) => image.url),
        [1, 3, 4].map(tinyOf)
      )
      assert.deepEqual(offeredKeys(userContent).get('beat_1'), [
        'video_1',
        'video_2',
        'video_3',
        'video_4'
      ])
      assert.deepEqual(rankings.beat_1, ['video_1', 'video_2', 'video_3', 'video_4'])
    })

    it('counts the cap in thumbnails, so candidates without one do not use it up', async () => {
      const [clips] = clipsPerBeat(1, 12)
      const candidates = clips.map((c, i) => (i < 3 ? { ...c, imageUrl: '' } : c))
      const { fake, candidatesByBeat } = setupCandidates([candidates], ON)
      await rank(fake, candidatesByBeat)

      assert.deepEqual(
        thumbnailOrder(fake.requests[0].userContent),
        candidatesByBeat.beat_1.slice(3, 3 + RANK_THUMBNAILS_PER_BEAT)
      )
    })

    it('sends the request it sent before when no candidate of the batch has a thumbnail', async () => {
      const bare = clipsPerBeat(2, 2).map((beat) => beat.map((c) => ({ ...c, imageUrl: '' })))
      const { fake, candidatesByBeat } = setupCandidates(bare, ON)
      await rank(fake, candidatesByBeat)

      assert.equal(fake.requests[0].systemPrompt, PROMPT_BEFORE_THUMBNAILS)
      assert.equal(fake.requests[0].userContent, USER_CONTENT_BEFORE_THUMBNAILS)
      assert.ok(!('images' in fake.requests[0]))
    })

    it('uses the tiny size of a photo and the preview of a video, together', async () => {
      const { fake, candidatesByBeat } = setupCandidates(
        [[photoCand(8, 'Sea foam'), videoCand(7, 'waves-on-a-beach')]],
        ON
      )
      await rank(fake, candidatesByBeat)

      assert.deepEqual(thumbnailOrder(fake.requests[0].userContent), ['photo_8', 'video_7'])
      assert.deepEqual(
        fake.requests[0].images?.map((image) => image.url),
        [
          'https://images.pexels.com/photos/8/pexels-photo-8.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280',
          tinyOf(7)
        ]
      )
    })
  })
})
