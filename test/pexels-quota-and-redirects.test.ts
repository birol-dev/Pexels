import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerSettingsHandlers } from '../src/main/ipc/settings.ipc.ts'
import { PexelsClient } from '../src/main/services/pexels/pexels-client.ts'
import { PexelsRateLimitTracker } from '../src/main/services/pexels/pexels-rate-limit.ts'
import { PexelsSearchCache } from '../src/main/services/pexels/pexels-search-cache.ts'
import { fetchValidatedDownload } from '../src/main/services/pexels/download-url-validation.ts'
import { ApiError } from '../src/main/services/http/api-errors.ts'
import { SecureSecrets } from '../src/main/services/storage/secure-secrets.ts'
import { SettingsStore } from '../src/main/services/storage/settings-store.ts'
import { invokeIpc } from './support/electron-stub.mjs'

const originalFetch = globalThis.fetch

const quotaHeaders = (remaining: number, resetInSeconds: number): Headers =>
  new Headers({
    'X-Ratelimit-Limit': '20000',
    'X-Ratelimit-Remaining': String(remaining),
    'X-Ratelimit-Reset': String(Math.floor(Date.now() / 1000) + resetInSeconds)
  })

describe('Pexels quota exhaustion fails fast', () => {
  beforeEach(() => PexelsRateLimitTracker.clear())
  afterEach(() => PexelsRateLimitTracker.clear())

  it('throws pexels_rate_limited instead of waiting when the reset is far away', async () => {
    PexelsRateLimitTracker.updateFromHeaders(quotaHeaders(0, 6 * 24 * 3600))

    const started = Date.now()
    await assert.rejects(
      () => PexelsRateLimitTracker.waitForQuota(),
      (err: unknown) =>
        err instanceof ApiError &&
        err.statusCode === 429 &&
        !err.isRetryable &&
        err.message.startsWith('pexels_rate_limited')
    )
    assert.ok(Date.now() - started < 500)
  })

  it('returns immediately while quota remains', async () => {
    PexelsRateLimitTracker.updateFromHeaders(quotaHeaders(5, 6 * 24 * 3600))
    await PexelsRateLimitTracker.waitForQuota()
  })
})

describe('PexelsClient with an exhausted quota', () => {
  const SIX_DAYS = 6 * 24 * 3600
  let requested: string[]

  const emptyVideoSearch = (remaining: number): Response =>
    new Response(JSON.stringify({ total_results: 0, videos: [] }), {
      status: 200,
      headers: quotaHeaders(remaining, SIX_DAYS)
    })

  const isQuotaError = (err: unknown): boolean =>
    err instanceof ApiError &&
    err.statusCode === 429 &&
    !err.isRetryable &&
    /^pexels_rate_limited: Pexels API quota is exhausted until /.test(err.message)

  beforeEach(async () => {
    PexelsClient.resetQuota()
    PexelsClient.resetCircuit()
    PexelsSearchCache.clear()
    await SecureSecrets.setSecret('pexelsKey', 'pexels-test')
    requested = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    PexelsClient.resetQuota()
    PexelsClient.resetCircuit()
  })

  it('does not back off and retry a 429 whose headers show the quota is spent', async () => {
    globalThis.fetch = (async (url: string) => {
      requested.push(url)
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: quotaHeaders(0, SIX_DAYS)
      })
    }) as typeof globalThis.fetch

    const started = Date.now()
    await assert.rejects(() => PexelsClient.searchVideos({ query: 'city street' }), isQuotaError)

    assert.equal(requested.length, 1)
    assert.ok(Date.now() - started < 400, 'no backoff was slept')
    assert.equal(PexelsClient.isQuotaExhausted(), true)
  })

  it('sends nothing once the quota is known to be spent, and keeps the circuit closed', async () => {
    let remaining = 0
    globalThis.fetch = (async (url: string) => {
      requested.push(url)
      return emptyVideoSearch(remaining)
    }) as typeof globalThis.fetch

    // The answer that spends the last request of the month.
    await PexelsClient.searchVideos({ query: 'query 0' })
    // More refusals than the circuit breaker tolerates as upstream failures.
    for (let attempt = 1; attempt <= 6; attempt++) {
      await assert.rejects(
        () => PexelsClient.searchVideos({ query: `query ${attempt}` }),
        isQuotaError
      )
    }
    assert.equal(requested.length, 1, 'no request was sent while the quota was spent')

    // A new key starts clean: the next search must reach Pexels, not an open circuit.
    PexelsClient.resetQuota()
    remaining = 19000
    await PexelsClient.searchVideos({ query: 'query 7' })
    assert.equal(requested.length, 2)
    assert.equal(PexelsClient.isQuotaExhausted(), false)
  })
})

describe('Changing the Pexels key', () => {
  before(() => registerSettingsHandlers())

  beforeEach(async () => {
    await SecureSecrets.setSecret('pexelsKey', 'pexels-old')
    PexelsRateLimitTracker.updateFromHeaders(quotaHeaders(0, 6 * 24 * 3600))
  })

  afterEach(() => PexelsRateLimitTracker.clear())

  it('forgets the quota learned with the previous key', async () => {
    await invokeIpc('settings:updateSettings', { pexelsKey: 'pexels-new' })

    assert.equal(await SecureSecrets.getSecret('pexelsKey'), 'pexels-new')
    assert.equal(PexelsClient.getQuotaSnapshot(), null)
  })

  it('keeps the key and its quota when the field is blank or still masked', async () => {
    const shown = (await invokeIpc('settings:getPublicSettings')) as { pexelsKey: string }
    await invokeIpc('settings:updateSettings', { pexelsKey: '   ' })
    await invokeIpc('settings:updateSettings', { pexelsKey: shown.pexelsKey })

    assert.equal(await SecureSecrets.getSecret('pexelsKey'), 'pexels-old')
    assert.equal(PexelsClient.isQuotaExhausted(), true)
  })

  it('removes a stored key on request, together with its quota', async () => {
    await SecureSecrets.setSecret('openaiKey', 'sk-test')

    const shown = (await invokeIpc('settings:updateSettings', {
      removeSecrets: ['pexelsKey']
    })) as { pexelsKey: string; openaiKey: string }

    assert.equal(shown.pexelsKey, '')
    assert.notEqual(shown.openaiKey, '', 'other keys are left alone')
    assert.equal(await SecureSecrets.hasSecret('pexelsKey'), false)
    assert.equal(PexelsClient.getQuotaSnapshot(), null)
  })

  it('stores the model id remembered for each provider', async () => {
    await invokeIpc('settings:updateSettings', {
      modelIdByProvider: { openai: 'model-a', gemini: 'model-b' }
    })

    const settings = await SettingsStore.getSettings()
    assert.deepEqual(settings.modelIdByProvider, { openai: 'model-a', gemini: 'model-b' })
  })
})

describe('Download redirect validation', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const redirectTo = (location: string): Response =>
    ({ status: 302, headers: new Headers({ location }), body: null }) as unknown as Response
  const ok = (): Response =>
    ({ status: 200, headers: new Headers(), body: null }) as unknown as Response

  it('follows redirects between allowed hosts without auto-following', async () => {
    const requested: string[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      requested.push(url)
      assert.equal(init?.redirect, 'manual')
      return requested.length === 1 ? redirectTo('https://videos.pexels.com/final.mp4') : ok()
    }) as typeof globalThis.fetch

    const response = await fetchValidatedDownload('https://images.pexels.com/start.jpg')
    assert.equal(response.status, 200)
    assert.deepEqual(requested, [
      'https://images.pexels.com/start.jpg',
      'https://videos.pexels.com/final.mp4'
    ])
  })

  it('never requests a redirect target outside the allowlist', async () => {
    const requested: string[] = []
    globalThis.fetch = (async (url: string) => {
      requested.push(url)
      return redirectTo('https://169.254.169.254/latest/meta-data/')
    }) as typeof globalThis.fetch

    await assert.rejects(
      () => fetchValidatedDownload('https://images.pexels.com/start.jpg'),
      /not an allowed Pexels CDN/
    )
    assert.deepEqual(requested, ['https://images.pexels.com/start.jpg'])
  })

  it('gives up on redirect loops', async () => {
    globalThis.fetch = (async () =>
      redirectTo('https://images.pexels.com/loop.jpg')) as typeof globalThis.fetch

    await assert.rejects(
      () => fetchValidatedDownload('https://images.pexels.com/loop.jpg'),
      /redirected more than/
    )
  })
})
