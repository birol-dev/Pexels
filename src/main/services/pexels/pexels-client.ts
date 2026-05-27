import { SecureSecrets } from '../storage/secure-secrets'
import { SettingsStore } from '../storage/settings-store'
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

export class PexelsClient {
  private static async getHeaders(): Promise<HeadersInit> {
    const key = await SecureSecrets.getSecret('pexelsKey')
    if (!key) {
      throw new Error('Pexels API Key is missing. Please set it in Settings.')
    }
    return {
      Authorization: key
    }
  }

  private static async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const settings = await SettingsStore.getSettings()
    const timeoutMs = (settings.requestTimeoutSeconds || 60) * 1000
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      })
      return response
    } finally {
      clearTimeout(id)
    }
  }

  public static async searchPhotos(
    input: PexelsPhotoSearchInput
  ): Promise<PexelsPhotoSearchResult> {
    const headers = await this.getHeaders()
    const url = new URL('https://api.pexels.com/v1/search')

    url.searchParams.append('query', input.query)
    if (input.orientation) url.searchParams.append('orientation', input.orientation)
    if (input.size) url.searchParams.append('size', input.size)
    if (input.color) url.searchParams.append('color', input.color)
    if (input.locale) url.searchParams.append('locale', input.locale)
    if (input.page) url.searchParams.append('page', String(input.page))
    if (input.per_page) url.searchParams.append('per_page', String(input.per_page))

    const response = await this.fetchWithTimeout(url.toString(), { headers })
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('pexels_rate_limited: Pexels API rate limit reached.')
      }
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return PexelsPhotoSearchResultSchema.parse(data)
  }

  public static async searchVideos(
    input: PexelsVideoSearchInput
  ): Promise<PexelsVideoSearchResult> {
    const headers = await this.getHeaders()
    const url = new URL('https://api.pexels.com/videos/search')

    url.searchParams.append('query', input.query)
    if (input.orientation) url.searchParams.append('orientation', input.orientation)
    if (input.size) url.searchParams.append('size', input.size)
    if (input.locale) url.searchParams.append('locale', input.locale)
    if (input.page) url.searchParams.append('page', String(input.page))
    if (input.per_page) url.searchParams.append('per_page', String(input.per_page))

    const response = await this.fetchWithTimeout(url.toString(), { headers })
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('pexels_rate_limited: Pexels API rate limit reached.')
      }
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return PexelsVideoSearchResultSchema.parse(data)
  }

  public static async getPhoto(id: number): Promise<PexelsPhoto> {
    const headers = await this.getHeaders()
    const response = await this.fetchWithTimeout(`https://api.pexels.com/v1/photos/${id}`, {
      headers
    })
    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return PexelsPhotoSchema.parse(data)
  }

  public static async getVideo(id: number): Promise<PexelsVideo> {
    const headers = await this.getHeaders()
    const response = await this.fetchWithTimeout(`https://api.pexels.com/videos/videos/${id}`, {
      headers
    })
    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return PexelsVideoSchema.parse(data)
  }
}
