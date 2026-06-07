import { SecureSecrets } from '../storage/secure-secrets'
import { SettingsStore } from '../storage/settings-store'
import { ApiCircuitBreaker, ApiError, fetchWithRetry } from '../http/api-errors'
import {
  PexelsPhotoSearchInput,
  PexelsPhotoSearchResult,
  PexelsPhotoSearchResultSchema,
  PexelsPhoto,
  PexelsPhotoSchema,
  PexelsVideoSearchInput,
  PexelsVideoSearchResult,
  PexelsVideoSearchResultSchema,
  PexelsVideo,
  PexelsVideoSchema
} from './pexels-types'
import { PexelsQuotaSnapshot, PexelsRateLimitTracker } from './pexels-rate-limit'
import { PexelsSearchCache } from './pexels-search-cache'

const pexelsCircuit = new ApiCircuitBreaker(5, 60_000)

export class PexelsClient {
  private static async getHeaders(): Promise<HeadersInit> {
    const key = await SecureSecrets.getSecret('pexelsKey')
    if (!key) {
      throw new ApiError('Pexels API Key is missing. Please set it in Settings.', 'permanent')
    }
    return {
      Authorization: key
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
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const parentSignal = init?.signal
    if (parentSignal?.aborted) {
      clearTimeout(timeoutId)
      throw new ApiError('Request aborted', 'permanent')
    }

    const onParentAbort = (): void => controller.abort()
    parentSignal?.addEventListener('abort', onParentAbort)

    try {
      await PexelsRateLimitTracker.waitForQuota((waitMs) => {
        console.info(
          `[Pexels] Monthly quota exhausted. Waiting ${Math.ceil(waitMs / 1000)}s for reset.`
        )
      })

      const response = await fetchWithRetry(url, {
        label,
        maxRetries: 3,
        init: {
          ...init,
          signal: controller.signal
        },
        isAborted: () => controller.signal.aborted
      })

      PexelsRateLimitTracker.updateFromHeaders(response.headers)
      pexelsCircuit.recordSuccess()
      return response
    } catch (error) {
      pexelsCircuit.recordFailure()
      if (error instanceof ApiError && error.statusCode === 429) {
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
      clearTimeout(timeoutId)
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
    input: PexelsPhotoSearchInput
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

    const response = await this.fetchPexels(url.toString(), { headers }, 'Pexels photo search')
    const data = await response.json()
    const parsed = PexelsPhotoSearchResultSchema.parse(data)
    PexelsSearchCache.set(cacheKey, parsed)
    return parsed
  }

  public static async searchVideos(
    input: PexelsVideoSearchInput
  ): Promise<PexelsVideoSearchResult> {
    const cacheKey = PexelsSearchCache.buildKey(
      'video',
      input as unknown as Record<string, unknown>
    )
    const cached = PexelsSearchCache.get<PexelsVideoSearchResult>(cacheKey)
    if (cached) return cached

    const headers = await this.getHeaders()
    const url = new URL('https://api.pexels.com/v1/videos/search')

    url.searchParams.append('query', input.query)
    if (input.orientation) url.searchParams.append('orientation', input.orientation)
    if (input.size) url.searchParams.append('size', input.size)
    if (input.locale) url.searchParams.append('locale', input.locale)
    if (input.page) url.searchParams.append('page', String(input.page))
    if (input.per_page) url.searchParams.append('per_page', String(input.per_page))

    const response = await this.fetchPexels(url.toString(), { headers }, 'Pexels video search')
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
    const response = await this.fetchPexels(
      `https://api.pexels.com/v1/videos/videos/${id}`,
      { headers },
      'Pexels get video'
    )
    const data = await response.json()
    return PexelsVideoSchema.parse(data)
  }
}
