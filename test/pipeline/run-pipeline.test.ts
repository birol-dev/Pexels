import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  initialPipelineState,
  type PipelineState
} from '../../src/main/services/pipeline/context.ts'
import { runPipeline } from '../../src/main/services/pipeline/run-pipeline.ts'
import type { PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'
import { video } from '../support/pexels-fixtures.ts'
import {
  beatIdsIn,
  defaultAnswer,
  fakeContext,
  pipelineBeat,
  stateAt,
  videoCand,
  type FakeContext,
  type FakeContextOptions
} from '../support/pipeline-context.ts'

const videosFrom = (start: number, count: number): PexelsVideo[] =>
  Array.from({ length: count }, (_, i) => video(start + i, `clip-${start + i}`))

/** Three beats, each with six videos: beat_1 has 1 to 6, beat_2 11 to 16 and beat_3 21 to 26. */
function threeBeats(over: Partial<FakeContextOptions> = {}): FakeContext {
  return fakeContext({
    beats: [
      pipelineBeat('beat_1', { queries: ['ocean'], assetType: 'video' }),
      pipelineBeat('beat_2', { queries: ['forest'], assetType: 'video' }),
      pipelineBeat('beat_3', { queries: ['city'], assetType: 'video' })
    ],
    videos: { ocean: videosFrom(1, 6), forest: videosFrom(11, 6), city: videosFrom(21, 6) },
    ...over
  })
}

/** Caches the candidates a saved state names, as the runner's cache holds them across a restart. */
function cacheFor(fake: FakeContext, state: PipelineState): void {
  const keys = new Set(Object.values(state.candidatesByBeat).flat())
  fake.ctx.cacheCandidates(
    [...keys].map((key) => videoCand(Number(key.split('_')[1]), `clip-${key.split('_')[1]}`))
  )
}

const REAL_CANDIDATES = {
  candidatesByBeat: {
    beat_1: ['video_1', 'video_2', 'video_3'],
    beat_2: ['video_11', 'video_12', 'video_13'],
    beat_3: ['video_21', 'video_22', 'video_23']
  }
}
const REAL_RANKINGS = {
  rankingByBeat: {
    beat_1: ['video_2', 'video_1'],
    beat_2: ['video_12', 'video_11'],
    beat_3: ['video_22', 'video_21']
  }
}

const stepsSaved = (fake: FakeContext): string[] => fake.saves.map((s) => s.step)
const rankingRequests = (fake: FakeContext): FakeContext['requests'] =>
  fake.requests.filter((r) => r.tool === 'submit_rankings')

describe('runPipeline from the start', () => {
  it('searches each beat once, ranks them in one request, picks one asset per beat and finishes', async () => {
    const fake = threeBeats()
    const outcome = await runPipeline(fake.ctx)

    assert.equal(outcome, 'finished')
    assert.equal(fake.searches.length, 3)
    assert.equal(fake.requests.length, 1)
    assert.equal(fake.requests[0].tool, 'submit_rankings')
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), ['beat_1', 'beat_2', 'beat_3'])
    assert.deepEqual(fake.selections, [
      { beatId: 'beat_1', key: 'video_1' },
      { beatId: 'beat_2', key: 'video_11' },
      { beatId: 'beat_3', key: 'video_21' }
    ])
    assert.equal(fake.holds, 0)
    assert.deepEqual(stepsSaved(fake), ['searched', 'ranked', 'allocated', 'retried', 'done'])
  })

  it('uses the model order when picking', async () => {
    const fake = threeBeats({
      answer: () => ({
        beats: [
          { beatId: 'beat_1', ranked: ['video_3', 'video_1'] },
          { beatId: 'beat_2', ranked: ['video_12'] },
          { beatId: 'beat_3', ranked: ['video_26'] }
        ]
      })
    })
    await runPipeline(fake.ctx)
    assert.deepEqual(
      fake.selections.map((s) => s.key),
      ['video_3', 'video_12', 'video_26']
    )
  })

  it('records the work it did in the state it saves', async () => {
    const fake = threeBeats()
    await runPipeline(fake.ctx)
    const last = fake.saves.at(-1)
    assert.equal(last?.step, 'done')
    assert.deepEqual(Object.keys(last?.candidatesByBeat ?? {}), ['beat_1', 'beat_2', 'beat_3'])
    assert.equal(last?.candidatesByBeat.beat_1.length, 6)
    assert.equal(last?.rankingByBeat.beat_1.length, 5)
    assert.equal(last?.modelCalls, 1)
    assert.deepEqual(last?.retriedBeats, [])
  })

  it('reports progress that never goes backwards, from the search to the pick', async () => {
    const fake = threeBeats()
    await runPipeline(fake.ctx)
    const percents = fake.progress.map((p) => p.percent)
    assert.deepEqual(
      percents,
      [...percents].sort((a, b) => a - b)
    )
    assert.ok(fake.progress.some((p) => p.step === 'Searching Pexels (3 of 3)'))
    assert.ok(fake.progress.some((p) => p.step === 'Ranking footage (batch 1 of 1)'))
  })

  it('asks every beat for as many assets as the target says', async () => {
    const fake = threeBeats({ settings: { optionsPerBeat: 2 } })
    await runPipeline(fake.ctx)
    assert.equal(fake.selections.length, 6)
    assert.deepEqual(
      fake.selections.map((s) => s.beatId),
      ['beat_1', 'beat_2', 'beat_3', 'beat_1', 'beat_2', 'beat_3']
    )
  })

  it('stops picking at the download cap, serving earlier beats first', async () => {
    const fake = threeBeats({ settings: { maxTotalDownloads: 2 } })
    await runPipeline(fake.ctx)
    assert.deepEqual(
      fake.selections.map((s) => s.beatId),
      ['beat_1', 'beat_2']
    )
    // Beat 3 has candidates left, so it is not one with nothing and gets no broader round.
    assert.equal(fake.requests.filter((r) => r.tool === 'submit_broader_queries').length, 0)
  })

  it('gives a candidate that two beats found to one of them only', async () => {
    const shared = videosFrom(1, 6)
    const fake = fakeContext({
      beats: [
        pipelineBeat('beat_1', { queries: ['ocean'], assetType: 'video' }),
        pipelineBeat('beat_2', { queries: ['sea'], assetType: 'video' })
      ],
      videos: { ocean: shared, sea: shared }
    })
    await runPipeline(fake.ctx)
    assert.deepEqual(fake.selections, [
      { beatId: 'beat_1', key: 'video_1' },
      { beatId: 'beat_2', key: 'video_2' }
    ])
  })

  it('takes the next ranked candidate when a pick is refused', async () => {
    const fake = threeBeats({ refuses: { beat_1: ['video_1'] } })
    await runPipeline(fake.ctx)
    assert.deepEqual(fake.selections.map((s) => s.beatId).sort(), ['beat_1', 'beat_2', 'beat_3'])
    assert.deepEqual(
      fake.selections.find((s) => s.beatId === 'beat_1'),
      { beatId: 'beat_1', key: 'video_2' }
    )
  })

  it('makes no model request when no beat has a candidate to rank, apart from the broader queries', async () => {
    const fake = threeBeats({ videos: {} })
    await runPipeline(fake.ctx)
    assert.equal(rankingRequests(fake).length, 0)
    assert.deepEqual(fake.selections, [])
  })
})

describe('runPipeline resumed at each step', () => {
  it("at 'planned' with nothing saved, runs every step", async () => {
    const fake = threeBeats()
    await runPipeline(fake.ctx, { state: initialPipelineState() })
    assert.equal(fake.searches.length, 3)
    assert.equal(rankingRequests(fake).length, 1)
    assert.equal(fake.selections.length, 3)
  })

  it("at 'planned' with some beats searched, searches only the rest", async () => {
    const state = stateAt({ candidatesByBeat: { beat_1: ['video_1', 'video_2', 'video_3'] } })
    const fake = threeBeats()
    cacheFor(fake, state)
    await runPipeline(fake.ctx, { state })

    assert.deepEqual(
      fake.searches.map((s) => s.query),
      ['forest', 'city']
    )
    // Ranking sees the saved candidates of beat_1 too.
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), ['beat_1', 'beat_2', 'beat_3'])
    assert.match(fake.requests[0].userContent, /- video_2: /)
  })

  it("at 'searched', makes no search and goes on to rank", async () => {
    const state = stateAt({ step: 'searched', ...REAL_CANDIDATES })
    const fake = threeBeats()
    cacheFor(fake, state)
    await runPipeline(fake.ctx, { state })

    assert.equal(fake.searches.length, 0)
    assert.equal(rankingRequests(fake).length, 1)
    assert.equal(fake.selections.length, 3)
  })

  it("at 'searched' with the first batch ranked, ranks only the beats left", async () => {
    const beats = Array.from({ length: 7 }, (_, i) =>
      pipelineBeat(`beat_${i + 1}`, { queries: [`q${i + 1}`], assetType: 'video' })
    )
    const videos = Object.fromEntries(beats.map((b, i) => [`q${i + 1}`, videosFrom(i * 10 + 1, 6)]))
    const candidatesByBeat = Object.fromEntries(
      beats.map((b, i) => [b.id, [`video_${i * 10 + 1}`, `video_${i * 10 + 2}`]])
    )
    const state = stateAt({
      step: 'searched',
      candidatesByBeat,
      rankingByBeat: Object.fromEntries(
        beats.slice(0, 5).map((b, i) => [b.id, [`video_${i * 10 + 1}`]])
      )
    })
    const fake = fakeContext({ beats, videos })
    cacheFor(fake, state)
    await runPipeline(fake.ctx, { state })

    assert.equal(fake.searches.length, 0)
    assert.equal(fake.requests.length, 1)
    assert.deepEqual(beatIdsIn(fake.requests[0].userContent), ['beat_6', 'beat_7'])
    assert.equal(fake.selections.length, 7)
  })

  it("at 'ranked', makes no search and no model request, and picks from the saved rankings", async () => {
    const state = stateAt({ step: 'ranked', ...REAL_CANDIDATES, ...REAL_RANKINGS })
    const fake = threeBeats()
    cacheFor(fake, state)
    const outcome = await runPipeline(fake.ctx, { state })

    assert.equal(outcome, 'finished')
    assert.equal(fake.searches.length, 0)
    assert.equal(fake.requests.length, 0)
    assert.deepEqual(
      fake.selections.map((s) => s.key),
      ['video_2', 'video_12', 'video_22']
    )
  })

  it("at 'allocated' with every beat full, makes no search, no request and no pick", async () => {
    const state = stateAt({ step: 'allocated', ...REAL_CANDIDATES, ...REAL_RANKINGS })
    const fake = threeBeats()
    cacheFor(fake, state)
    fake.beats[0].held = ['video_2']
    fake.beats[1].held = ['video_12']
    fake.beats[2].held = ['video_22']
    const outcome = await runPipeline(fake.ctx, { state })

    assert.equal(outcome, 'finished')
    assert.equal(fake.searches.length, 0)
    assert.equal(fake.requests.length, 0)
    assert.equal(fake.selections.length, 0)
    assert.equal(fake.holds, 0)
  })

  it("at 'retried', makes no search and no request, and does not broaden again", async () => {
    const state = stateAt({
      step: 'retried',
      ...REAL_CANDIDATES,
      ...REAL_RANKINGS,
      retriedBeats: ['beat_2']
    })
    const fake = threeBeats()
    cacheFor(fake, state)
    fake.beats[0].held = ['video_2']
    fake.beats[2].held = ['video_22']
    // beat_2 holds nothing and its ranking is spent, but it was broadened already.
    fake.beats[1].excluded = ['video_12', 'video_11']
    await runPipeline(fake.ctx, { state })

    assert.equal(fake.searches.length, 0)
    assert.equal(fake.requests.length, 0)
    assert.equal(fake.selections.length, 0)
  })

  it("at 'done', does nothing but save", async () => {
    const state = stateAt({ step: 'done', ...REAL_CANDIDATES, ...REAL_RANKINGS })
    const fake = threeBeats()
    cacheFor(fake, state)
    const outcome = await runPipeline(fake.ctx, { state })

    assert.equal(outcome, 'finished')
    assert.equal(fake.searches.length, 0)
    assert.equal(fake.requests.length, 0)
    assert.equal(fake.selections.length, 0)
    assert.deepEqual(stepsSaved(fake), ['done'])
  })

  it('carries on from the state object it was given, updating it in place', async () => {
    const state = initialPipelineState()
    const fake = threeBeats()
    await runPipeline(fake.ctx, { state })
    assert.equal(state.step, 'done')
    assert.equal(Object.keys(state.rankingByBeat).length, 3)
  })
})

describe('runPipeline paused part-way', () => {
  it('keeps the beats searched before the pause, and searches only the rest on resume', async () => {
    let pause = true
    const fake = threeBeats({
      onSearch: async (_type, query) => {
        if (query !== 'city' || !pause) return
        await new Promise((resolve) => setTimeout(resolve, 5))
        fake.controller.abort(new Error('paused'))
        throw new Error('paused')
      }
    })
    const state = initialPipelineState()
    await assert.rejects(runPipeline(fake.ctx, { state }), /paused/)

    assert.deepEqual(Object.keys(state.candidatesByBeat).sort(), ['beat_1', 'beat_2'])
    assert.equal(state.step, 'planned')
    assert.equal(fake.requests.length, 0)

    pause = false
    fake.restart()
    const before = fake.searches.length
    await runPipeline(fake.ctx, { state })
    assert.deepEqual(
      fake.searches.slice(before).map((s) => s.query),
      ['city']
    )
    assert.equal(state.step, 'done')
    assert.equal(fake.selections.length, 3)
  })

  it('keeps the batches ranked before the pause, and asks only for the rest on resume', async () => {
    const beats = Array.from({ length: 7 }, (_, i) =>
      pipelineBeat(`beat_${i + 1}`, { queries: [`q${i + 1}`], assetType: 'video' })
    )
    const videos = Object.fromEntries(beats.map((b, i) => [`q${i + 1}`, videosFrom(i * 10 + 1, 6)]))
    let pause = true
    const fake = fakeContext({
      beats,
      videos,
      answer: (request, call) => {
        if (pause && call === 2) {
          fake.controller.abort(new Error('paused'))
          throw new Error('paused')
        }
        return {
          beats: beatIdsIn(request.userContent).map((beatId) => ({ beatId, ranked: [] }))
        }
      }
    })
    const state = initialPipelineState()
    await assert.rejects(runPipeline(fake.ctx, { state }), /paused/)

    // The first batch landed (beats 1 to 5, ranked empty on purpose), the second did not.
    assert.deepEqual(Object.keys(state.rankingByBeat).sort(), [
      'beat_1',
      'beat_2',
      'beat_3',
      'beat_4',
      'beat_5'
    ])
    assert.equal(state.modelCalls, 1)

    pause = false
    fake.restart()
    const searchesBefore = fake.searches.length
    const requestsBefore = fake.requests.length
    await runPipeline(fake.ctx, { state })

    assert.equal(fake.searches.length - searchesBefore, 0)
    const resumed = fake.requests.slice(requestsBefore).filter((r) => r.tool === 'submit_rankings')
    assert.equal(resumed.length, 1)
    assert.deepEqual(beatIdsIn(resumed[0].userContent), ['beat_6', 'beat_7'])
  })

  it('stops before the next step when the signal aborts between steps', async () => {
    const fake = threeBeats()
    const save = fake.ctx.saveState
    fake.ctx.saveState = async (state) => {
      await save(state)
      if (state.step === 'searched') fake.controller.abort(new Error('paused'))
    }
    await assert.rejects(runPipeline(fake.ctx), /paused/)
    assert.equal(fake.requests.length, 0)
    assert.deepEqual(stepsSaved(fake), ['searched'])
  })
})

describe('runPipeline under approval', () => {
  it('picks, saves and holds for the user, and does not go on to the broader round', async () => {
    const fake = threeBeats({
      settings: { requireApproval: true },
      videos: { ocean: videosFrom(1, 6), forest: videosFrom(11, 6), city: [] }
    })
    const outcome = await runPipeline(fake.ctx)

    assert.equal(outcome, 'held')
    assert.equal(fake.holds, 1)
    assert.equal(fake.selections.length, 2)
    assert.deepEqual(stepsSaved(fake).at(-1), 'allocated')
    assert.equal(fake.requests.filter((r) => r.tool === 'submit_broader_queries').length, 0)
  })

  it('replaces a rejected pick from the ranking with no model request, and holds again', async () => {
    const fake = threeBeats({ settings: { requireApproval: true } })
    const state = initialPipelineState()
    assert.equal(await runPipeline(fake.ctx, { state }), 'held')
    const requestsBefore = fake.requests.length
    const searchesBefore = fake.searches.length

    // The user rejects beat_2's pick: the runner drops it from the beat and excludes it.
    fake.beats[1].held = []
    fake.beats[1].excluded = ['video_11']
    fake.restart()
    assert.equal(await runPipeline(fake.ctx, { state }), 'held')

    assert.equal(fake.requests.length, requestsBefore)
    assert.equal(fake.searches.length, searchesBefore)
    assert.deepEqual(fake.selections.slice(3), [{ beatId: 'beat_2', key: 'video_12' }])
    assert.equal(fake.holds, 2)
  })

  it('finishes when the user approved every pick', async () => {
    const fake = threeBeats({ settings: { requireApproval: true } })
    const state = initialPipelineState()
    assert.equal(await runPipeline(fake.ctx, { state }), 'held')

    fake.restart()
    assert.equal(await runPipeline(fake.ctx, { state }), 'finished')
    assert.equal(fake.holds, 1)
    assert.equal(fake.selections.length, 3)
    assert.equal(state.step, 'done')
  })

  it('does not hold when there is nothing to review', async () => {
    const fake = threeBeats({ settings: { requireApproval: true }, videos: {} })
    assert.equal(await runPipeline(fake.ctx), 'finished')
    assert.equal(fake.holds, 0)
  })

  it('holds a second time for what the broader round found', async () => {
    const fake = threeBeats({
      settings: { requireApproval: true },
      videos: {
        ocean: videosFrom(1, 6),
        forest: videosFrom(11, 6),
        city: [],
        'broader beat_3': videosFrom(31, 6)
      }
    })
    const state = initialPipelineState()
    assert.equal(await runPipeline(fake.ctx, { state }), 'held')
    // The first hold covers beats 1 and 2 only. On resume the user has approved them.
    assert.equal(fake.selections.length, 2)

    fake.restart()
    assert.equal(await runPipeline(fake.ctx, { state }), 'held')
    assert.deepEqual(fake.selections.at(-1), { beatId: 'beat_3', key: 'video_31' })
    assert.equal(fake.holds, 2)

    fake.restart()
    assert.equal(await runPipeline(fake.ctx, { state }), 'finished')
    assert.equal(fake.holds, 2)
    assert.equal(fake.requests.filter((r) => r.tool === 'submit_broader_queries').length, 1)
  })
})

describe('runPipeline broader round', () => {
  const emptyCity = {
    ocean: videosFrom(1, 6),
    forest: videosFrom(11, 6),
    city: [],
    'broader beat_3': videosFrom(31, 6)
  }

  it('sends one broader request for the beat with nothing, searches it again and ranks it', async () => {
    const fake = threeBeats({ videos: emptyCity })
    const state = initialPipelineState()
    await runPipeline(fake.ctx, { state })

    const broader = fake.requests.filter((r) => r.tool === 'submit_broader_queries')
    assert.equal(broader.length, 1)
    assert.deepEqual(beatIdsIn(broader[0].userContent), ['beat_3'])
    assert.match(broader[0].userContent, /Tried: city/)

    // The first ranking holds beats 1 and 2 only (beat_3 had nothing to rank). The second is beat_3's.
    const rankings = rankingRequests(fake)
    assert.equal(rankings.length, 2)
    assert.deepEqual(beatIdsIn(rankings[0].userContent), ['beat_1', 'beat_2'])
    assert.deepEqual(beatIdsIn(rankings[1].userContent), ['beat_3'])

    assert.deepEqual(fake.selections.at(-1), { beatId: 'beat_3', key: 'video_31' })
    assert.deepEqual(state.retriedBeats, ['beat_3'])
    assert.deepEqual(state.broaderQueries, { beat_3: ['broader beat_3'] })
    assert.equal(state.modelCalls, 3)
    assert.equal(state.step, 'done')
  })

  it('searches the beat again by the broader queries, in broad mode, for videos and photos', async () => {
    const fake = threeBeats({ videos: emptyCity })
    await runPipeline(fake.ctx)
    const again = fake.searches.filter((s) => s.query === 'broader beat_3')
    assert.deepEqual(again, [{ type: 'video', query: 'broader beat_3' }])
    assert.deepEqual(fake.ctx.beats()[2].tried, ['city', 'broader beat_3'])
  })

  it('does not run a second time, even when the broader search found nothing either', async () => {
    const fake = threeBeats({ videos: { ...emptyCity, 'broader beat_3': [] } })
    const state = initialPipelineState()
    await runPipeline(fake.ctx, { state })
    const broaderCount = (): number =>
      fake.requests.filter((r) => r.tool === 'submit_broader_queries').length
    assert.equal(broaderCount(), 1)
    assert.deepEqual(
      fake.selections.map((s) => s.beatId),
      ['beat_1', 'beat_2']
    )

    // Run it again from an earlier step, as a restart could: it must not broaden twice.
    state.step = 'allocated'
    fake.restart()
    await runPipeline(fake.ctx, { state })
    assert.equal(broaderCount(), 1)
  })

  it('resumes a broader round that was paused after the queries were written', async () => {
    let pause = true
    const fake = threeBeats({
      videos: emptyCity,
      onSearch: async (_type, query) => {
        if (query === 'broader beat_3' && pause) {
          fake.controller.abort(new Error('paused'))
          throw new Error('paused')
        }
      }
    })
    const state = initialPipelineState()
    await assert.rejects(runPipeline(fake.ctx, { state }), /paused/)
    assert.deepEqual(state.retriedBeats, ['beat_3'])
    assert.equal(state.step, 'allocated')

    pause = false
    fake.restart()
    await runPipeline(fake.ctx, { state })
    assert.equal(fake.requests.filter((r) => r.tool === 'submit_broader_queries').length, 1)
    assert.deepEqual(fake.selections.at(-1), { beatId: 'beat_3', key: 'video_31' })
  })

  it('goes on without the broader queries when the request fails, and says so', async () => {
    const fake = threeBeats({
      videos: emptyCity,
      answer: (request, call) => {
        if (request.tool.name === 'submit_broader_queries') throw new Error('model said no')
        return defaultAnswer(request, call)
      }
    })
    const state = initialPipelineState()
    assert.equal(await runPipeline(fake.ctx, { state }), 'finished')
    assert.equal(state.step, 'done')
    assert.deepEqual(state.retriedBeats, [])
    assert.ok(fake.logs.some((l) => l.type === 'error' && l.message.includes('model said no')))
  })

  it('sends only the beats that qualify', async () => {
    const fake = fakeContext({
      beats: [
        pipelineBeat('beat_1', { queries: ['ocean'], assetType: 'video' }),
        pipelineBeat('beat_2', { queries: ['nothing'], assetType: 'video' }),
        pipelineBeat('beat_3', { queries: ['city'], assetType: 'video' }),
        pipelineBeat('beat_4', { queries: ['nada'], assetType: 'video' })
      ],
      videos: { ocean: videosFrom(1, 6), city: videosFrom(21, 6) }
    })
    await runPipeline(fake.ctx)
    const broader = fake.requests.filter((r) => r.tool === 'submit_broader_queries')
    assert.equal(broader.length, 1)
    assert.deepEqual(beatIdsIn(broader[0].userContent), ['beat_2', 'beat_4'])
  })

  it('makes no broader request when every beat has footage', async () => {
    const fake = threeBeats()
    await runPipeline(fake.ctx)
    assert.equal(fake.requests.filter((r) => r.tool === 'submit_broader_queries').length, 0)
  })
})
