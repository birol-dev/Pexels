import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Records answers of the Pexels API to a folder and replays them on later runs, so a
 * re-run spends no Pexels quota and two prompt versions see identical search results.
 * Only successful GET requests to api.pexels.com are recorded: searches and the by-id
 * lookups. The request's Authorization header is never written.
 */

export interface PexelsRateLimit {
  limit: number
  remaining: number
  /** Epoch seconds. */
  resetAt: number
}

export interface PexelsCacheEntry {
  key: string
  recordedAt: string
  status: number
  /** The X-Ratelimit-* headers that came with the answer, if it had them. */
  rateLimit: PexelsRateLimit | null
  body: unknown
}

export interface PexelsCacheStats {
  /** Requests that went to Pexels and spent quota. */
  live: number
  /** Requests answered from the cache folder. */
  replayed: number
}

export interface PexelsCache {
  stats: PexelsCacheStats
  /**
   * Answers a Pexels API request from the cache folder, or calls `forward` and records
   * its answer. `forward` performs the real request.
   */
  fetch(url: URL, forward: () => Promise<Response>, signal?: AbortSignal | null): Promise<Response>
}

export interface PexelsCacheOptions {
  cacheDir: string
  /** Epoch milliseconds; tests pass a fixed clock. */
  now?: () => number
}

export function isPexelsApiRequest(url: URL, method: string): boolean {
  return url.hostname === 'api.pexels.com' && method === 'GET'
}

/** The URL path plus its query parameters in sorted order, so parameter order is irrelevant. */
export function pexelsCacheKey(url: URL): string {
  const params = [...url.searchParams.entries()].sort(
    ([nameA, valueA], [nameB, valueB]) => nameA.localeCompare(nameB) || valueA.localeCompare(valueB)
  )
  const query = new URLSearchParams(params).toString()
  return query ? `${url.pathname}?${query}` : url.pathname
}

/** A readable file name for a key, made unique by a hash of the whole key. */
export function pexelsCacheFileName(key: string): string {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
  return `${slug}-${hash}.json`
}

export function readRateLimit(headers: Headers): PexelsRateLimit | null {
  const values = ['X-Ratelimit-Limit', 'X-Ratelimit-Remaining', 'X-Ratelimit-Reset'].map((name) =>
    headers.get(name)
  )
  if (values.some((value) => value === null || value.trim() === '')) return null
  const [limit, remaining, resetAt] = values.map(Number)
  if (![limit, remaining, resetAt].every(Number.isFinite)) return null
  return { limit, remaining, resetAt }
}

/**
 * The quota a replayed answer reports, so the client's quota tracking keeps working:
 * the newest live answer of this run if there is one (a replay spends nothing, so that
 * is still the truth), otherwise what was recorded, as long as its window is still
 * open. A window that has since reset says nothing about today, so it is left out.
 * `remaining` never goes below 1: a zero would make the client wait for the reset
 * before a request the cache can answer for free.
 */
export function replayRateLimit(
  recorded: PexelsRateLimit | null,
  live: PexelsRateLimit | null,
  nowSeconds: number
): PexelsRateLimit | null {
  const known = live ?? (recorded && recorded.resetAt > nowSeconds ? recorded : null)
  return known ? { ...known, remaining: Math.max(1, known.remaining) } : null
}

function isCacheEntry(value: unknown): value is PexelsCacheEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<PexelsCacheEntry>
  return typeof entry.key === 'string' && typeof entry.status === 'number' && 'body' in entry
}

export function createPexelsCache(options: PexelsCacheOptions): PexelsCache {
  const now = options.now ?? Date.now
  const stats: PexelsCacheStats = { live: 0, replayed: 0 }
  let lastLive: PexelsRateLimit | null = null

  const read = async (key: string): Promise<PexelsCacheEntry | null> => {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(options.cacheDir, pexelsCacheFileName(key)), 'utf8')
      )
      return isCacheEntry(parsed) && parsed.key === key ? parsed : null
    } catch {
      // A missing or unreadable entry is a cache miss; the next answer replaces it.
      return null
    }
  }

  const write = async (entry: PexelsCacheEntry): Promise<void> => {
    await mkdir(options.cacheDir, { recursive: true })
    const path = join(options.cacheDir, pexelsCacheFileName(entry.key))
    // Write beside the target and rename, so an interrupted run leaves no half entry.
    const tempPath = `${path}.${process.pid}.tmp`
    await writeFile(tempPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
    await rename(tempPath, path)
  }

  const replay = (entry: PexelsCacheEntry): Response => {
    const headers = new Headers({ 'content-type': 'application/json' })
    const quota = replayRateLimit(entry.rateLimit, lastLive, Math.floor(now() / 1000))
    if (quota) {
      headers.set('X-Ratelimit-Limit', String(quota.limit))
      headers.set('X-Ratelimit-Remaining', String(quota.remaining))
      headers.set('X-Ratelimit-Reset', String(quota.resetAt))
    }
    return new Response(JSON.stringify(entry.body), { status: entry.status, headers })
  }

  const record = async (key: string, response: Response): Promise<void> => {
    try {
      // The copy is read here; the caller gets the untouched original.
      const body: unknown = JSON.parse(await response.clone().text())
      await write({
        key,
        recordedAt: new Date(now()).toISOString(),
        status: response.status,
        rateLimit: readRateLimit(response.headers),
        body
      })
    } catch (error) {
      console.warn(
        `[eval] Could not record the Pexels answer for ${key}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    stats,
    async fetch(url, forward, signal) {
      if (signal?.aborted) {
        throw new DOMException('This operation was aborted', 'AbortError')
      }
      const key = pexelsCacheKey(url)
      const cached = await read(key)
      if (cached) {
        stats.replayed++
        return replay(cached)
      }

      stats.live++
      const response = await forward()
      lastLive = readRateLimit(response.headers) ?? lastLive
      if (response.ok) await record(key, response)
      return response
    }
  }
}
