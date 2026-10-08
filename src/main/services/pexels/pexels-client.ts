import { SecureSecrets } from '../storage/secure-secrets.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import { ApiCircuitBreaker, ApiError, fetchWithRetry } from '../http/api-errors.ts'
import {
  type PexelsPhotoSearchInput,
  type PexelsPhotoSearchResult,
  PexelsPhotoSearchResultSchema,
  type PexelsPhoto,
  PexelsPhotoSchema,
  type PexelsVideoSearchInput,
  type PexelsVideoSearchResult,
  PexelsVideoSearchResultSchema,
  type PexelsVideo,
  PexelsVideoSchema
} from './pexels-types.ts'
import { type PexelsQuotaSnapshot, PexelsRateLimitTracker } from './pexels-rate-limit.ts'
import { PexelsSearchCache } from './pexels-search-cache.ts'
import { PEXELS_VIDEO_SEARCH_URL, pexelsVideoByIdUrl } from './pexels-api-urls.ts'

const pexelsCircuit = new ApiCircuitBreaker(5, 60_000)

export class PexelsClient {
  public static resetCircuit(): void {
    pexelsCircuit.reset()
  }

  /** Forget quota learned from a previous API key. */
  public static resetQuota(): void {
    PexelsRateLimitTracker.clear()
  }

  public static isQuotaExhausted(): boolean {
    return PexelsRateLimitTracker.isExhausted()
  }

  private static async getHeaders(): Promise<HeadersInit> {
    const key = await SecureSecrets.getSecret('pexelsKey')
    if (!key || !key.trim()) {
      throw new ApiError('Pexels API Key is missing. Please set it in Settings.', 'permanent')
    }
    return {
      Authorization: key.trim()
    }
  }

  private static async fetchPexels(
    url: string,
    init?: RequestInit,
    label = 'Pexels API'
  ): Promise<Response> {
    pexelsCircuit.ensureClosed(label)

    const settings = await SettingsStore.getSettings()
    const timeoutMs = (settings.requestTimeoutSeconds || 60) * 1000
    const controller = new AbortController()

    const parentSignal = init?.signal
    if (parentSignal?.aborted) {
      throw new ApiError('Request aborted', 'permanent')
    }

    const onParentAbort = (): void => controller.abort()
    parentSignal?.addEventListener('abort', onParentAbort)

    let timeoutId: NodeJS.Timeout | null = null

    // Outside the try below: an exhausted quota is not an upstream failure and
    // must not count toward the circuit breaker.
    try {
      await PexelsRateLimitTracker.waitForQuota((waitMs) => {
        console.info(`[Pexels] Quota exhausted. Waiting ${Math.ceil(waitMs / 1000)}s for reset.`)
      }, controller.signal)
    } catch (error) {
      parentSignal?.removeEventListener('abort', onParentAbort)
      throw error
    }

    try {
      // Start the HTTP timeout clock only after quota wait finishes
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetchWithRetry(url, {
        label,
        maxRetries: 3,
        init: {
          ...init,
          signal: controller.signal
        },
        isAborted: () => controller.signal.aborted,
        // docs/04: capture rate-limit headers when present. A 429 whose headers show a
        // spent quota is final, so it is not backed off and retried.
        onErrorResponse: (errorResponse) => {
          PexelsRateLimitTracker.updateFromHeaders(errorResponse.headers)
          return errorResponse.status === 429 ? PexelsRateLimitTracker.exhaustedError() : null
        }
      })

      PexelsRateLimitTracker.updateFromHeaders(response.headers)
      pexelsCircuit.recordSuccess()
      return response
    } catch (error) {
      // The spent-quota error from above: like the wait before the request, it is not
      // an upstream failure, and it keeps its own message.
      const quotaSpent = error instanceof ApiError && error.statusCode === 429 && !error.isRetryable
      // Caller cancel/pause must not open the circuit — only real upstream failures.
      if (!parentSignal?.aborted && !quotaSpent) {
        pexelsCircuit.recordFailure()
      }
      if (error instanceof ApiError && error.statusCode === 429 && !quotaSpent) {
        throw new ApiError(
          'pexels_rate_limited: Pexels API rate limit reached.',
          'transient',
          429,
          error.retryAfterMs,
          error
        )
      }
      throw error
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      parentSignal?.removeEventListener('abort', onParentAbort)
    }
  }

  public static getQuotaSnapshot(): PexelsQuotaSnapshot | null {
    return PexelsRateLimitTracker.getSnapshot()
  }

  public static isQuotaLow(): boolean {
    return PexelsRateLimitTracker.isLow()
  }

  public static async searchPhotos(
    input: PexelsPhotoSearchInput,
    abortSignal?: AbortSignal
  ): Promise<PexelsPhotoSearchResult> {
    const cacheKey = PexelsSearchCache.buildKey(
      'photo',
      input as unknown as Record<string, unknown>
    )
    const cached = PexelsSearchCache.get<PexelsPhotoSearchResult>(cacheKey)
    if (cached) return cached

    const headers = await this.getHeaders()
    const url = new URL('https://api.pexels.com/v1/search')

    url.searchParams.append('query', input.query)
    if (input.orientation) url.searchParams.append('orientation', input.orientation)
    if (input.size) url.searchParams.append('size', input.size)
    if (input.color) url.searchParams.append('color', input.color)
    if (input.locale) url.searchParams.append('locale', input.locale)
    if (input.page) url.searchParams.append('page', String(input.page))
    if (input.per_page) url.searchParams.append('per_page', String(input.per_page))

    const response = await this.fetchPexels(
      url.toString(),
      { headers, signal: abortSignal },
      'Pexels photo search'
    )
    const data = await response.json()
    const parsed = PexelsPhotoSearchResultSchema.parse(data)
    PexelsSearchCache.set(cacheKey, parsed)
    return parsed
  }

  public static async searchVideos(
    input: PexelsVideoSearchInput,
    abortSignal?: AbortSignal
  ): Promise<PexelsVideoSearchResult> {
    const cacheKey = PexelsSearchCache.buildKey(
      'video',
      input as unknown as Record<string, unknown>
    )
    const cached = PexelsSearchCache.get<PexelsVideoSearchResult>(cacheKey)
    if (cached) return cached

    const headers = await this.getHeaders()
    const url = new URL(PEXELS_VIDEO_SEARCH_URL)

    url.searchParams.append('query', input.query)
    if (input.orientation) url.searchParams.append('orientation', input.orientation)
    if (input.size) url.searchParams.append('size', input.size)
    if (input.locale) url.searchParams.append('locale', input.locale)
    if (input.page) url.searchParams.append('page', String(input.page))
    if (input.per_page) url.searchParams.append('per_page', String(input.per_page))

    const response = await this.fetchPexels(
      url.toString(),
      { headers, signal: abortSignal },
      'Pexels video search'
    )
    const data = await response.json()
    const parsed = PexelsVideoSearchResultSchema.parse(data)
    PexelsSearchCache.set(cacheKey, parsed)
    return parsed
  }

  public static async getPhoto(id: number): Promise<PexelsPhoto> {
    const headers = await this.getHeaders()
    const response = await this.fetchPexels(
      `https://api.pexels.com/v1/photos/${id}`,
      { headers },
      'Pexels get photo'
    )
    const data = await response.json()
    return PexelsPhotoSchema.parse(data)
  }

  public static async getVideo(id: number): Promise<PexelsVideo> {
    const headers = await this.getHeaders()
    const response = await this.fetchPexels(pexelsVideoByIdUrl(id), { headers }, 'Pexels get video')
    const data = await response.json()
    return PexelsVideoSchema.parse(data)
  }
}
