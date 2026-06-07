const CACHE_TTL_MS = 60 * 60 * 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export class PexelsSearchCache {
  private static cache = new Map<string, CacheEntry<unknown>>()

  public static buildKey(type: 'photo' | 'video', input: Record<string, unknown>): string {
    const normalized = Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const value = input[key]
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = value
        }
        return acc
      }, {})

    return `${type}:${JSON.stringify(normalized)}`
  }

  public static get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  public static set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS
    })
  }
}
