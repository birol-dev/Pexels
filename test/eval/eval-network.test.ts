import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  countersSince,
  installEvalNetwork,
  type EvalNetwork
} from '../../scripts/eval/eval-network.ts'
import { createLlmMeter, isLlmRequest, readWireUsage } from '../../scripts/eval/llm-meter.ts'

const SEARCH_URL = 'https://api.pexels.com/v1/search?query=harbor&per_page=15'
const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const PEXELS_KEY = 'pexels-key-that-must-stay-out-of-the-cache'

interface StubRequest {
  url: string
  method: string
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

describe('eval network: a stubbed fetch behind the evaluation layer', () => {
  let originalFetch: typeof globalThis.fetch
  let requests: StubRequest[]
  let cacheDir: string
  let layer: EvalNetwork | undefined

  /** Nothing in this file may reach the internet: every request ends in this stub. */
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'stockfinder-eval-network-'))
    requests = []
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: url.href, method: (init?.method || 'GET').toUpperCase() })
      if (url.hostname === 'api.pexels.com') {
        return json({ total_results: 1, photos: [{ id: 201 }] }, 200, {
          'X-Ratelimit-Limit': '200',
          'X-Ratelimit-Remaining': String(200 - requests.length),
          'X-Ratelimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
        })
      }
      if (url.href === CHAT_URL) {
        return json({
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 800 }
          }
        })
      }
      return new Response(new Uint8Array(2048), { headers: { 'content-type': 'video/mp4' } })
    }) as typeof globalThis.fetch
  })

  afterEach(async () => {
    layer?.restore()
    layer = undefined
    globalThis.fetch = originalFetch
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('records a Pexels search on the first run and replays it on the second', async () => {
    const stub = globalThis.fetch
    layer = installEvalNetwork({ cacheDir })
    const first = await fetch(SEARCH_URL, { headers: { Authorization: PEXELS_KEY } })
    const firstBody = await first.json()
    assert.deepEqual(layer.counters().pexelsLive, 1)
    layer.restore()
    assert.equal(globalThis.fetch, stub, 'restore puts back the fetch that was there')

    // The second run: a new layer on the same folder, with the parameters in another order.
    layer = installEvalNetwork({ cacheDir })
    const second = await fetch('https://api.pexels.com/v1/search?per_page=15&query=harbor', {
      headers: { Authorization: PEXELS_KEY }
    })

    assert.deepEqual(await second.json(), firstBody)
    assert.equal(requests.length, 1, 'the replay made no request')
    assert.equal(second.headers.get('X-Ratelimit-Limit'), '200')
    assert.equal(second.headers.get('X-Ratelimit-Remaining'), '199')
    assert.ok(Number(second.headers.get('X-Ratelimit-Reset')) > Date.now() / 1000)
    assert.deepEqual(
      { live: layer.counters().pexelsLive, replayed: layer.counters().pexelsReplayed },
      { live: 0, replayed: 1 }
    )

    const [file] = await readdir(cacheDir)
    const stored = await readFile(join(cacheDir, file), 'utf8')
    assert.ok(!stored.includes(PEXELS_KEY), 'the API key is not written to the cache')
  })

  it('counts LLM requests and their tokens, and never caches them', async () => {
    layer = installEvalNetwork({ cacheDir })
    const before = layer.counters()

    const options = { method: 'POST', body: JSON.stringify({ model: 'gpt-4o', messages: [] }) }
    const first = await fetch(CHAT_URL, options)
    await fetch(CHAT_URL, options)

    assert.equal(
      ((await first.json()) as { usage: { prompt_tokens: number } }).usage.prompt_tokens,
      1000
    )
    assert.equal(requests.length, 2)
    assert.deepEqual(countersSince(before, layer.counters()), {
      llmCalls: 2,
      llmFailedCalls: 0,
      inputTokens: 2000,
      cachedInputTokens: 1600,
      outputTokens: 100,
      pexelsLive: 0,
      pexelsReplayed: 0,
      mediaRequests: 0
    })
    assert.deepEqual(await readdir(cacheDir), [])
  })

  it('passes media downloads through and counts them', async () => {
    layer = installEvalNetwork({ cacheDir })

    const response = await fetch('https://videos.pexels.com/video-files/101/101-hd.mp4')

    assert.equal((await response.arrayBuffer()).byteLength, 2048)
    assert.equal(requests.length, 1)
    assert.equal(layer.counters().mediaRequests, 1)
  })

  it('answers media downloads with a placeholder when downloads are off', async () => {
    layer = installEvalNetwork({ cacheDir, noDownload: true })

    const clip = await fetch('https://videos.pexels.com/video-files/101/101-hd.mp4')
    const still = await fetch('https://images.pexels.com/photos/201/pexels-photo-201.jpeg')

    assert.equal(requests.length, 0, 'no media request left the process')
    assert.equal(clip.headers.get('content-type'), 'video/mp4')
    assert.equal(still.headers.get('content-type'), 'image/jpeg')
    const text = await clip.text()
    assert.match(text, /Placeholder/)
    assert.equal(clip.headers.get('content-length'), String(Buffer.byteLength(text)))
    assert.equal(layer.counters().mediaRequests, 2)

    await assert.rejects(
      fetch('https://videos.pexels.com/video-files/101/101-hd.mp4', {
        signal: AbortSignal.abort()
      }),
      { name: 'AbortError' }
    )
  })

  it('leaves every other request alone', async () => {
    layer = installEvalNetwork({ cacheDir })

    await fetch('https://api.pexels.com/v1/collections', { method: 'POST' })
    await fetch('https://example.test/anything')

    assert.deepEqual(
      requests.map((request) => `${request.method} ${request.url}`),
      ['POST https://api.pexels.com/v1/collections', 'GET https://example.test/anything']
    )
    assert.deepEqual(layer.counters(), {
      llmCalls: 0,
      llmFailedCalls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      pexelsLive: 0,
      pexelsReplayed: 0,
      mediaRequests: 0
    })
    assert.deepEqual(await readdir(cacheDir), [])
  })
})

describe('eval LLM meter', () => {
  it('knows the three provider hosts, for POST requests', () => {
    for (const url of [
      CHAT_URL,
      'https://api.openai.com/v1/responses',
      'https://openrouter.ai/api/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    ]) {
      assert.equal(isLlmRequest(new URL(url), 'POST'), true, url)
    }
    assert.equal(isLlmRequest(new URL('https://api.openai.com/v1/models'), 'GET'), false)
    assert.equal(isLlmRequest(new URL(SEARCH_URL), 'POST'), false)
  })

  it('reads chat completion usage (OpenAI and OpenRouter)', () => {
    const usage = {
      prompt_tokens: 1200,
      completion_tokens: 80,
      total_tokens: 1280,
      prompt_tokens_details: { cached_tokens: 1024 }
    }
    assert.deepEqual(readWireUsage({ choices: [], usage }), {
      inputTokens: 1200,
      cachedInputTokens: 1024,
      outputTokens: 80
    })
    assert.deepEqual(readWireUsage({ usage: { prompt_tokens: 10, completion_tokens: 2 } }), {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 2
    })
  })

  it('reads OpenAI Responses API usage', () => {
    const usage = {
      input_tokens: 900,
      output_tokens: 120,
      input_tokens_details: { cached_tokens: 300 },
      output_tokens_details: { reasoning_tokens: 64 }
    }
    assert.deepEqual(readWireUsage({ output: [], usage }), {
      inputTokens: 900,
      cachedInputTokens: 300,
      outputTokens: 120
    })
  })

  it('reads Gemini usage and counts thinking as output', () => {
    const usageMetadata = {
      promptTokenCount: 700,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 25,
      cachedContentTokenCount: 512,
      totalTokenCount: 765
    }
    assert.deepEqual(readWireUsage({ candidates: [], usageMetadata }), {
      inputTokens: 700,
      cachedInputTokens: 512,
      outputTokens: 65
    })
  })

  it('reads nothing from a body without usage', () => {
    assert.equal(readWireUsage({ error: { message: 'bad request' } }), null)
    assert.equal(readWireUsage('not an object'), null)
    assert.equal(readWireUsage(null), null)
  })

  it('counts a rejected and an unanswered request as calls that failed', async () => {
    const meter = createLlmMeter()

    const rejected = await meter.fetch(async () => json({ error: { message: 'nope' } }, 400))
    assert.equal(rejected.status, 400)
    await assert.rejects(
      meter.fetch(async () => {
        throw new TypeError('fetch failed')
      }),
      /fetch failed/
    )
    const answered = await meter.fetch(async () =>
      json({ usage: { prompt_tokens: 100, completion_tokens: 20 } })
    )

    assert.deepEqual(await answered.json(), {
      usage: { prompt_tokens: 100, completion_tokens: 20 }
    })
    assert.deepEqual(meter.totals, {
      calls: 3,
      failedCalls: 2,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 20
    })
  })
})
