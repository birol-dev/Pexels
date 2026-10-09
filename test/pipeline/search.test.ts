import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_CANDIDATES,
  RESULTS_PER_SEARCH,
  SEARCH_POOL_SIZE,
  queriesFor,
  searchBeats,
  typesToSearch
} from '../../src/main/services/pipeline/search.ts'
import { ApiError } from '../../src/main/services/http/api-errors.ts'
import { PEXELS_KEY_MISSING_MESSAGE } from '../../src/main/services/pexels/pexels-errors.ts'
import type { PipelineBeat } from '../../src/main/services/pipeline/context.ts'
import type { PexelsPhoto, PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'
import { photo, video } from '../support/pexels-fixtures.ts'
import { fakeContext, pipelineBeat, type FakeContextOptions } from '../support/pipeline-context.ts'

const videosFrom = (start: number, count: number, slug = 'clip'): PexelsVideo[] =>
  Array.from({ length: count }, (_, i) => video(start + i, `${slug}-${start + i}`))
const photosFrom = (start: number, count: number): PexelsPhoto[] =>
  Array.from({ length: count }, (_, i) => photo(start + i, `photo ${start + i}`))

async function search(
  options: FakeContextOptions,
  beats: PipelineBeat[],
  mode: 'focused' | 'broad' = 'focused'
): Promise<{ fake: ReturnType<typeof fakeContext>; found: Map<string, string[]> }> {
  const fake = fakeContext(options)
  const result = await searchBeats(fake.ctx, beats, mode)
  const found = new Map(
    [...result].map(([id, list]) => [id, list.map((c) => `${c.type}_${c.pexelsId}`)])
  )
  return { fake, found }
}

describe('typesToSearch', () => {
  it('follows the mix when it allows one type', () => {
    assert.deepEqual(typesToSearch('either', 'videos only'), ['video'])
    assert.deepEqual(typesToSearch('photo', 'videos only'), ['video'])
    assert.deepEqual(typesToSearch('either', 'photos only'), ['photo'])
    assert.deepEqual(typesToSearch('video', 'photos only'), ['photo'])
  })

  it('follows the beat when the mix allows both, and tries videos first for either', () => {
    assert.deepEqual(typesToSearch('video', 'videos + photos'), ['video'])
    assert.deepEqual(typesToSearch('photo', 'videos + photos'), ['photo'])
    assert.deepEqual(typesToSearch('either', 'videos + photos'), ['video', 'photo'])
  })
})

describe('queriesFor', () => {
  it('trims, drops repeats and too-short queries, and cuts long ones', () => {
    const queries = queriesFor({
      queries: [' ocean ', 'Ocean', 'x', 'sea', 'y'.repeat(150)],
      visualPrompt: 'unused',
      text: 'unused'
    })
    assert.deepEqual(queries, ['ocean', 'sea', 'y'.repeat(100)])
  })

  it('searches by the visual prompt when the beat has no query, then by its text', () => {
    assert.deepEqual(
      queriesFor({ queries: [], visualPrompt: 'Sunrise over hills', text: 'Text.' }),
      ['Sunrise over hills']
    )
    assert.deepEqual(queriesFor({ queries: [], visualPrompt: '  ', text: 'Narration text.' }), [
      'Narration text.'
    ])
  })
})

describe('searchBeats', () => {
  it('searches videos for the first query and stops there when it found enough', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea'] })
    const { fake, found } = await search({ beats: [beat], videos: { ocean: videosFrom(1, 6) } }, [
      beat
    ])

    assert.deepEqual(fake.searches, [{ type: 'video', query: 'ocean' }])
    assert.equal(found.get('beat_1')?.length, 6)
  })

  it('sends the second query when the first left fewer candidates than the minimum', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea', 'waves'] })
    const { fake, found } = await search(
      {
        beats: [beat],
        videos: { ocean: videosFrom(1, MIN_CANDIDATES - 1), sea: videosFrom(10, 3) }
      },
      [beat]
    )
    // The third query is never sent in focused mode.
    assert.deepEqual(
      fake.searches.filter((s) => s.type === 'video').map((s) => s.query),
      ['ocean', 'sea']
    )
    assert.equal(found.get('beat_1')?.length, MIN_CANDIDATES - 1 + 3)
  })

  it('sends every query at once in broad mode', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea', 'waves'] })
    const { fake, found } = await search(
      {
        beats: [beat],
        videos: { ocean: videosFrom(1, 6), sea: videosFrom(10, 6), waves: videosFrom(20, 6) }
      },
      [beat],
      'broad'
    )
    assert.deepEqual(
      fake.searches.map((s) => s.query),
      ['ocean', 'sea', 'waves']
    )
    // The candidates of the three queries are joined in query order, then cut to the limit.
    assert.equal(found.get('beat_1')?.length, 12)
    assert.equal(found.get('beat_1')?.[0], 'video_1')
  })

  it('goes on to photos for an either beat only when videos left it short', async () => {
    const short = pipelineBeat('beat_1', { queries: ['ocean'] })
    const full = pipelineBeat('beat_2', { queries: ['forest'] })
    const { fake, found } = await search(
      {
        beats: [short, full],
        videos: { ocean: videosFrom(1, 2), forest: videosFrom(50, 6) },
        photos: { ocean: photosFrom(100, 4), forest: photosFrom(200, 4) }
      },
      [short, full]
    )

    const typesFor = (query: string): string[] =>
      fake.searches.filter((s) => s.query === query).map((s) => s.type)
    assert.deepEqual(typesFor('ocean'), ['video', 'photo'])
    assert.deepEqual(typesFor('forest'), ['video'])
    assert.equal(found.get('beat_1')?.length, 6)
    assert.equal(found.get('beat_2')?.length, 6)
  })

  it('searches only the type the beat names when the mix allows both', async () => {
    const beat = pipelineBeat('beat_1', { assetType: 'photo', queries: ['ocean'] })
    const { fake } = await search({ beats: [beat], photos: { ocean: photosFrom(1, 3) } }, [beat])
    assert.deepEqual(fake.searches, [{ type: 'photo', query: 'ocean' }])
  })

  it('searches only videos under videos only, whatever the beat names', async () => {
    const beat = pipelineBeat('beat_1', { assetType: 'photo', queries: ['ocean'] })
    const { fake } = await search(
      { beats: [beat], settings: { mix: 'videos only' }, videos: { ocean: videosFrom(1, 6) } },
      [beat]
    )
    assert.deepEqual(fake.searches, [{ type: 'video', query: 'ocean' }])
  })

  it('asks Pexels for the platform orientation and the page size', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean'] })
    const orientations: string[] = []
    const fake = fakeContext({ beats: [beat], settings: { platform: 'TikTok' } })
    const original = fake.ctx.searchVideos
    fake.ctx.searchVideos = async (params) => {
      orientations.push(`${params.orientation}:${params.per_page}`)
      return original(params)
    }
    await searchBeats(fake.ctx, [beat], 'focused')
    assert.deepEqual(orientations, [`portrait:${RESULTS_PER_SEARCH}`])
  })

  it('does not send a query the skip explicit setting blocks, and says so', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['nude statue', 'marble statue'] })
    const { fake, found } = await search(
      { beats: [beat], videos: { 'marble statue': videosFrom(1, 6) } },
      [beat]
    )
    assert.deepEqual(
      fake.searches.map((s) => s.query),
      ['marble statue']
    )
    assert.ok(fake.logs.some((l) => l.message.includes('Skipped the query "nude statue"')))
    assert.equal(found.get('beat_1')?.length, 6)
  })

  it('sends a blocked query when skip explicit is off', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['nude statue'] })
    const { fake } = await search(
      {
        beats: [beat],
        settings: { skipExplicit: false },
        videos: { 'nude statue': videosFrom(1, 6) }
      },
      [beat]
    )
    assert.deepEqual(
      fake.searches.map((s) => s.query),
      ['nude statue']
    )
  })

  it('leaves out results the safety settings hide', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['street'] })
    const { found } = await search(
      {
        beats: [beat],
        settings: { avoidPeople: true },
        videos: {
          street: [
            video(1, 'crowd-of-people-1'),
            video(2, 'empty-street-2'),
            video(3, 'a-woman-walking-3'),
            video(4, 'quiet-alley-4')
          ]
        }
      },
      [beat]
    )
    assert.deepEqual(found.get('beat_1'), ['video_2', 'video_4'])
  })

  it('keeps what the description says on each candidate', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean'], assetType: 'video' })
    const fake = fakeContext({
      beats: [beat],
      videos: { ocean: [video(1, 'waves-crashing-on-rocks'), ...videosFrom(10, 5)] }
    })
    const result = await searchBeats(fake.ctx, [beat], 'focused')
    assert.equal(result.get('beat_1')?.[0].about, 'waves crashing on rocks')
  })

  it('notes each query it sends for the beat, so the beat remembers what was tried', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea'] })
    const { fake } = await search({ beats: [beat] }, [beat], 'broad')
    // No results for either query, so the beat tried every type: video and photo.
    assert.deepEqual(fake.ctx.beats()[0].tried, ['ocean', 'sea'])
  })

  it('keeps a candidate that two beats found, for both beats', async () => {
    const one = pipelineBeat('beat_1', { queries: ['ocean'] })
    const two = pipelineBeat('beat_2', { queries: ['sea'] })
    const shared = videosFrom(1, 6)
    const { found } = await search({ beats: [one, two], videos: { ocean: shared, sea: shared } }, [
      one,
      two
    ])
    assert.deepEqual(found.get('beat_1'), found.get('beat_2'))
  })

  it('leaves out a candidate the beat must not get', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean'], excluded: ['video_1'] })
    const { found } = await search({ beats: [beat], videos: { ocean: videosFrom(1, 6) } }, [beat])
    assert.ok(!found.get('beat_1')?.includes('video_1'))
    assert.equal(found.get('beat_1')?.length, 5)
  })

  it('logs a query that failed and goes on with the others', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea'] })
    const { fake, found } = await search(
      {
        beats: [beat],
        videos: { sea: videosFrom(1, 6) },
        onSearch: (_type, query) => {
          if (query === 'ocean') throw new Error('Pexels returned 500')
        }
      },
      [beat],
      'broad'
    )
    assert.equal(found.get('beat_1')?.length, 6)
    assert.ok(
      fake.logs.some(
        (l) =>
          l.type === 'error' && l.message.includes('Search for "ocean" failed: Pexels returned 500')
      )
    )
  })

  it('stops with the error when Pexels refuses the key, instead of trying the other queries', async () => {
    for (const status of [401, 403]) {
      const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea'] })
      const fake = fakeContext({
        beats: [beat],
        videos: { sea: videosFrom(1, 6) },
        onSearch: () => {
          throw new ApiError(`Pexels API failed: HTTP ${status}`, 'permanent', status)
        }
      })
      await assert.rejects(searchBeats(fake.ctx, [beat], 'focused'), /HTTP 40[13]/)
      assert.equal(fake.searches.length, 1, `HTTP ${status} ended the search`)
    }
  })

  it('stops with the error when the Pexels key is missing', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean'] })
    const fake = fakeContext({
      beats: [beat],
      onSearch: () => {
        throw new ApiError(PEXELS_KEY_MISSING_MESSAGE, 'permanent')
      }
    })
    await assert.rejects(searchBeats(fake.ctx, [beat], 'focused'), /Key is missing/)
  })

  it('still goes on after other Pexels failures, a missing page or a server error', async () => {
    for (const status of [404, 500]) {
      const beat = pipelineBeat('beat_1', { queries: ['ocean', 'sea'] })
      const { fake, found } = await search(
        {
          beats: [beat],
          videos: { sea: videosFrom(1, 6) },
          onSearch: (_type, query) => {
            if (query === 'ocean') throw new ApiError('Pexels API failed', 'permanent', status)
          }
        },
        [beat]
      )
      assert.equal(found.get('beat_1')?.length, 6)
      assert.ok(fake.logs.some((l) => l.message.includes('Search for "ocean" failed')))
    }
  })

  it('gives a beat with nothing found an empty list and says what was tried', async () => {
    const beat = pipelineBeat('beat_1', { queries: ['ocean'] })
    const { fake, found } = await search({ beats: [beat] }, [beat])
    assert.deepEqual(found.get('beat_1'), [])
    assert.ok(
      fake.logs.some((l) =>
        l.message.includes('[beat_1] No usable candidates from 2 searches (ocean)')
      )
    )
  })

  it('stops with the error when the job was paused, instead of logging a failed query', async () => {
    const beats = [pipelineBeat('beat_1'), pipelineBeat('beat_2')]
    const fake = fakeContext({
      beats,
      onSearch: () => {
        fake.controller.abort(new Error('paused'))
        throw new Error('aborted')
      }
    })
    await assert.rejects(searchBeats(fake.ctx, beats, 'focused'), /aborted|paused/)
    assert.equal(fake.logs.filter((l) => l.type === 'error').length, 0)
  })

  it('hears of each beat as it finishes', async () => {
    const beats = [
      pipelineBeat('beat_1', { queries: ['ocean'] }),
      pipelineBeat('beat_2', { queries: ['forest'] })
    ]
    const fake = fakeContext({
      beats,
      videos: { ocean: videosFrom(1, 6), forest: videosFrom(20, 6) }
    })
    const heard: string[] = []
    await searchBeats(fake.ctx, beats, 'focused', (beat, candidates) => {
      heard.push(`${beat.id}:${candidates.length}`)
    })
    assert.deepEqual(heard.sort(), ['beat_1:6', 'beat_2:6'])
  })

  it('keeps the beats that finished when a later one is stopped', async () => {
    const beats = [
      pipelineBeat('beat_1', { queries: ['ocean'], assetType: 'video' }),
      pipelineBeat('beat_2', { queries: ['forest'], assetType: 'video' })
    ]
    const fake = fakeContext({
      beats,
      videos: { ocean: videosFrom(1, 6) },
      onSearch: async (_type, query) => {
        if (query !== 'forest') return
        // Let beat_1's search land first, then stop the job.
        await new Promise((resolve) => setTimeout(resolve, 5))
        fake.controller.abort(new Error('paused'))
        throw new Error('paused')
      }
    })
    const heard: string[] = []
    await assert.rejects(
      searchBeats(fake.ctx, beats, 'focused', (beat) => heard.push(beat.id)),
      /paused/
    )
    assert.deepEqual(heard, ['beat_1'])
  })

  it(`never has more than ${SEARCH_POOL_SIZE} searches out at once`, async () => {
    const beats = Array.from({ length: 12 }, (_, i) =>
      pipelineBeat(`beat_${i + 1}`, { queries: [`query ${i + 1}`], assetType: 'video' })
    )
    let active = 0
    let peak = 0
    const fake = fakeContext({
      beats,
      onSearch: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
      }
    })
    await searchBeats(fake.ctx, beats, 'focused')
    assert.equal(fake.searches.length, 12)
    assert.equal(peak, SEARCH_POOL_SIZE)
  })
})
