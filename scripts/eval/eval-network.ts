import { createLlmMeter, isLlmRequest } from './llm-meter.ts'
import { createPexelsCache, isPexelsApiRequest } from './pexels-cache.ts'

/**
 * Puts the evaluation's layer in front of globalThis.fetch, whatever that is when it
 * is installed: the real fetch for a live run, the fake network in tests. Pexels API
 * requests go through the record/replay cache, LLM requests are counted, and media
 * downloads pass through untouched unless `noDownload` is set.
 */

export interface NetworkCounters {
  llmCalls: number
  llmFailedCalls: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  /** Pexels API requests that spent quota. */
  pexelsLive: number
  /** Pexels API requests answered from the cache folder. */
  pexelsReplayed: number
  /** Media files the job asked for, fetched or not. */
  mediaRequests: number
}

export interface EvalNetwork {
  /** Totals since the layer was installed, as a copy. */
  counters(): NetworkCounters
  /** Puts back the fetch that was there before. */
  restore(): void
}

export interface EvalNetworkOptions {
  /** Folder of the Pexels record/replay cache. */
  cacheDir: string
  /** Answer media downloads with a small placeholder instead of fetching the files. */
  noDownload?: boolean
}

const MEDIA_HOSTS = new Set(['images.pexels.com', 'videos.pexels.com'])
const PLACEHOLDER_MEDIA = new TextEncoder().encode(
  'Placeholder written by the evaluation runner (--no-download). This is not a media file.\n'
)

/** What happened between two readings of the counters. */
export function countersSince(before: NetworkCounters, after: NetworkCounters): NetworkCounters {
  return {
    llmCalls: after.llmCalls - before.llmCalls,
    llmFailedCalls: after.llmFailedCalls - before.llmFailedCalls,
    inputTokens: after.inputTokens - before.inputTokens,
    cachedInputTokens: after.cachedInputTokens - before.cachedInputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    pexelsLive: after.pexelsLive - before.pexelsLive,
    pexelsReplayed: after.pexelsReplayed - before.pexelsReplayed,
    mediaRequests: after.mediaRequests - before.mediaRequests
  }
}

export function installEvalNetwork(options: EvalNetworkOptions): EvalNetwork {
  const baseFetch = globalThis.fetch
  const cache = createPexelsCache({ cacheDir: options.cacheDir })
  const meter = createLlmMeter()
  let mediaRequests = 0

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const forward = (): Promise<Response> => baseFetch(input, init)

    if (isPexelsApiRequest(url, method)) {
      return cache.fetch(url, forward, init?.signal)
    }
    if (isLlmRequest(url, method)) {
      return meter.fetch(forward)
    }
    if (MEDIA_HOSTS.has(url.hostname)) {
      mediaRequests++
      if (options.noDownload) {
        if (init?.signal?.aborted) {
          throw new DOMException('This operation was aborted', 'AbortError')
        }
        return new Response(PLACEHOLDER_MEDIA, {
          status: 200,
          headers: {
            'content-type': url.hostname === 'images.pexels.com' ? 'image/jpeg' : 'video/mp4',
            'content-length': String(PLACEHOLDER_MEDIA.length)
          }
        })
      }
    }
    return forward()
  }) as typeof globalThis.fetch

  return {
    counters: () => ({
      llmCalls: meter.totals.calls,
      llmFailedCalls: meter.totals.failedCalls,
      inputTokens: meter.totals.inputTokens,
      cachedInputTokens: meter.totals.cachedInputTokens,
      outputTokens: meter.totals.outputTokens,
      pexelsLive: cache.stats.live,
      pexelsReplayed: cache.stats.replayed,
      mediaRequests
    }),
    restore() {
      globalThis.fetch = baseFetch
    }
  }
}
