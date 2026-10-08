import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  createPexelsCache,
  isPexelsApiRequest,
  pexelsCacheFileName,
  pexelsCacheKey,
  readRateLimit,
  replayRateLimit,
  type PexelsCacheEntry
} from '../../scripts/eval/pexels-cache.ts'

const NOW_SECONDS = 1_800_000_000
const SEARCH_URL = 'https://api.pexels.com/v1/videos/search?query=fishing+boat&per_page=10&page=1'

/** A stand-in for the real request: counts its calls and answers like the Pexels API. */
function pexelsAnswer(
  body: unknown,
  quota: { remaining: number; resetAt: number } | null = {
    remaining: 150,
    resetAt: NOW_SECONDS + 600
  },
  status = 200
): { calls: number; forward: () => Promise<Response> } {
  const answer = {
    calls: 0,
    forward: async (): Promise<Response> => {
      answer.calls++
      const headers = new Headers({ 'content-type': 'application/json' })
      if (quota) {
        headers.set('X-Ratelimit-Limit', '200')
        headers.set('X-Ratelimit-Remaining', String(quota.remaining))
        headers.set('X-Ratelimit-Reset', String(quota.resetAt))
      }
      return new Response(JSON.stringify(body), { status, headers })
    }
  }
  return answer
}

function neverCalled(): Promise<Response> {
  throw new Error('The request went to the network instead of the cache.')
}

describe('eval Pexels cache: keys', () => {
  it('is the path plus the query parameters in sorted order', () => {
    assert.equal(
      pexelsCacheKey(new URL(SEARCH_URL)),
      '/v1/videos/search?page=1&per_page=10&query=fishing+boat'
    )
    assert.equal(
      pexelsCacheKey(
        new URL('https://api.pexels.com/v1/videos/search?page=1&query=fishing%20boat&per_page=10')
      ),
      pexelsCacheKey(new URL(SEARCH_URL)),
      'the order and encoding of the parameters do not matter'
    )
    assert.equal(
      pexelsCacheKey(new URL('https://api.pexels.com/v1/photos/2014422')),
      '/v1/photos/2014422'
    )
  })

  it('differs for another query, another page and the other media type', () => {
    const keys = [
      SEARCH_URL,
      SEARCH_URL.replace('fishing+boat', 'fishing+boats'),
      SEARCH_URL.replace('page=1', 'page=2'),
      SEARCH_URL.replace('/videos/search', '/search'),
      `${SEARCH_URL}&orientation=portrait`
    ].map((url) => pexelsCacheKey(new URL(url)))
    assert.equal(new Set(keys).size, keys.length)
  })

  it('becomes a readable file name that stays unique for long keys', () => {
    const name = pexelsCacheFileName('/v1/videos/search?page=1&per_page=10&query=fishing+boat')
    assert.match(
      name,
      /^v1-videos-search-page-1-per-page-10-query-fishing-boat-[0-9a-f]{16}\.json$/
    )

    const long = `/v1/search?query=${'very+long+query+'.repeat(20)}`
    const first = pexelsCacheFileName(`${long}a`)
    const second = pexelsCacheFileName(`${long}b`)
    assert.notEqual(first, second)
    assert.ok(first.length <= 80 + 1 + 16 + '.json'.length)
    assert.match(first, /^[a-z0-9-]+\.json$/)
  })

  it('covers GET requests to the API host only', () => {
    assert.equal(isPexelsApiRequest(new URL(SEARCH_URL), 'GET'), true)
    assert.equal(isPexelsApiRequest(new URL(SEARCH_URL), 'POST'), false)
    assert.equal(
      isPexelsApiRequest(new URL('https://videos.pexels.com/video-files/1/1-hd.mp4'), 'GET'),
      false
    )
  })
})

describe('eval Pexels cache: rate-limit headers', () => {
  const recorded = { limit: 200, remaining: 150, resetAt: NOW_SECONDS + 600 }

  it('reads the three headers, or nothing when one is missing', () => {
    const headers = new Headers({
      'X-Ratelimit-Limit': '200',
      'X-Ratelimit-Remaining': '150',
      'X-Ratelimit-Reset': String(NOW_SECONDS + 600)
    })
    assert.deepEqual(readRateLimit(headers), recorded)

    headers.delete('X-Ratelimit-Reset')
    assert.equal(readRateLimit(headers), null)
    assert.equal(readRateLimit(new Headers({ 'X-Ratelimit-Limit': 'many' })), null)
  })

  it('replays the newest live answer of the run when there is one', () => {
    const live = { limit: 200, remaining: 90, resetAt: NOW_SECONDS + 3000 }
    assert.deepEqual(replayRateLimit(recorded, live, NOW_SECONDS), live)
    assert.deepEqual(replayRateLimit(null, live, NOW_SECONDS), live)
  })

  it('replays the recorded quota while its window is open, and nothing after the reset', () => {
    assert.deepEqual(replayRateLimit(recorded, null, NOW_SECONDS), recorded)
    assert.equal(replayRateLimit(recorded, null, NOW_SECONDS + 601), null)
    assert.equal(replayRateLimit(null, null, NOW_SECONDS), null)
  })

  it('never replays a quota of zero, which would make the client wait for the reset', () => {
    assert.deepEqual(replayRateLimit({ ...recorded, remaining: 0 }, null, NOW_SECONDS), {
      ...recorded,
      remaining: 1
    })
  })
})

describe('eval Pexels cache: record, then replay', () => {
  let cacheDir: string
  const now = (): number => NOW_SECONDS * 1000
  const body = { total_results: 1, page: 1, per_page: 10, videos: [{ id: 101 }] }

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'stockfinder-eval-cache-'))
  })

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('records a live answer and replays it without a second request', async () => {
    const cache = createPexelsCache({ cacheDir, now })
    const network = pexelsAnswer(body)

    const live = await cache.fetch(new URL(SEARCH_URL), network.forward)
    assert.deepEqual(await live.json(), body, 'the caller can still read the live answer')

    const reordered = new URL(
      'https://api.pexels.com/v1/videos/search?page=1&per_page=10&query=fishing+boat'
    )
    const replayed = await cache.fetch(reordered, network.forward)

    assert.equal(network.calls, 1)
    assert.deepEqual(cache.stats, { live: 1, replayed: 1 })
    assert.equal(replayed.status, 200)
    assert.deepEqual(await replayed.json(), body)
    assert.deepEqual(readRateLimit(replayed.headers), {
      limit: 200,
      remaining: 150,
      resetAt: NOW_SECONDS + 600
    })
  })

  it('writes one file per key, holding the answer and its quota but no request header', async () => {
    const cache = createPexelsCache({ cacheDir, now })
    await cache.fetch(new URL(SEARCH_URL), pexelsAnswer(body).forward)

    const files = await readdir(cacheDir)
    assert.deepEqual(files, [pexelsCacheFileName(pexelsCacheKey(new URL(SEARCH_URL)))])
    const entry = JSON.parse(await readFile(join(cacheDir, files[0]), 'utf8')) as PexelsCacheEntry
    assert.deepEqual(entry, {
      key: '/v1/videos/search?page=1&per_page=10&query=fishing+boat',
      recordedAt: new Date(NOW_SECONDS * 1000).toISOString(),
      status: 200,
      rateLimit: { limit: 200, remaining: 150, resetAt: NOW_SECONDS + 600 },
      body
    })
  })

  it('replays from the folder in a later run, which is a new cache object', async () => {
    await createPexelsCache({ cacheDir, now }).fetch(
      new URL(SEARCH_URL),
      pexelsAnswer(body).forward
    )

    const later = createPexelsCache({ cacheDir, now })
    const replayed = await later.fetch(new URL(SEARCH_URL), neverCalled)

    assert.deepEqual(later.stats, { live: 0, replayed: 1 })
    assert.deepEqual(await replayed.json(), body)
    assert.equal(replayed.headers.get('X-Ratelimit-Remaining'), '150')
  })

  it('sends no quota headers once the recorded window has reset', async () => {
    await createPexelsCache({ cacheDir, now }).fetch(
      new URL(SEARCH_URL),
      pexelsAnswer(body).forward
    )

    const nextDay = createPexelsCache({ cacheDir, now: () => (NOW_SECONDS + 86_400) * 1000 })
    const replayed = await nextDay.fetch(new URL(SEARCH_URL), neverCalled)

    assert.deepEqual(await replayed.json(), body)
    assert.equal(readRateLimit(replayed.headers), null)
  })

  it('reports the quota of the latest live answer on the replays that follow it', async () => {
    const cache = createPexelsCache({ cacheDir, now })
    const otherUrl = new URL('https://api.pexels.com/v1/search?query=harbor')
    await cache.fetch(new URL(SEARCH_URL), pexelsAnswer(body).forward)
    await cache.fetch(
      otherUrl,
      pexelsAnswer({ photos: [] }, { remaining: 120, resetAt: NOW_SECONDS + 900 }).forward
    )

    const replayed = await cache.fetch(new URL(SEARCH_URL), neverCalled)

    assert.deepEqual(readRateLimit(replayed.headers), {
      limit: 200,
      remaining: 120,
      resetAt: NOW_SECONDS + 900
    })
  })

  it('does not record an error answer, so the next run asks again', async () => {
    const cache = createPexelsCache({ cacheDir, now })
    const limited = pexelsAnswer(
      { error: 'Rate limit exceeded' },
      { remaining: 0, resetAt: NOW_SECONDS + 600 },
      429
    )

    const first = await cache.fetch(new URL(SEARCH_URL), limited.forward)
    assert.equal(first.status, 429)
    assert.equal(
      first.headers.get('X-Ratelimit-Remaining'),
      '0',
      'a live answer is passed on as it is'
    )
    assert.deepEqual(await readdir(cacheDir).catch(() => []), [])

    const working = pexelsAnswer(body)
    const second = await cache.fetch(new URL(SEARCH_URL), working.forward)
    assert.equal(working.calls, 1)
    assert.deepEqual(await second.json(), body)
    assert.deepEqual(cache.stats, { live: 2, replayed: 0 })
  })

  it('treats a damaged cache file as a miss and replaces it', async () => {
    const key = pexelsCacheKey(new URL(SEARCH_URL))
    await writeFile(join(cacheDir, pexelsCacheFileName(key)), '{ "key": "/v1/vid', 'utf8')
    const cache = createPexelsCache({ cacheDir, now })
    const network = pexelsAnswer(body)

    await cache.fetch(new URL(SEARCH_URL), network.forward)
    const replayed = await cache.fetch(new URL(SEARCH_URL), network.forward)

    assert.equal(network.calls, 1)
    assert.deepEqual(await replayed.json(), body)
  })

  it('answers an already aborted request with an abort error and no request', async () => {
    const cache = createPexelsCache({ cacheDir, now })
    const network = pexelsAnswer(body)

    await assert.rejects(cache.fetch(new URL(SEARCH_URL), network.forward, AbortSignal.abort()), {
      name: 'AbortError'
    })
    assert.equal(network.calls, 0)
    assert.deepEqual(cache.stats, { live: 0, replayed: 0 })
  })
})
