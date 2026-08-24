const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHE_SIZE = 500

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export class PexelsSearchCache {
  private static cache = new Map<string, CacheEntry<unknown>>()

  public static buildKey(type: 'photo' | 'video', input: Record<string, unknown>): string {
    const keys = Object.keys(input).sort()
    const parts: string[] = []
    for (const key of keys) {
      const val = input[key]
      if (val !== undefined && val !== null && val !== '') {
        parts.push(`${key}=${typeof val === 'string' ? val : JSON.stringify(val)}`)
      }
    }
    return `${type}:${parts.join('&')}`
  }

  public static get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // Refresh LRU order
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.data as T
  }

  public static set<T>(key: string, data: T): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS
    })
  }

  public static clear(): void {
    this.cache.clear()
  }
}
