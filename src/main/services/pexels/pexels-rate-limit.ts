import { ApiError } from '../http/api-errors.ts'

export interface PexelsQuotaSnapshot {
  limit: number
  remaining: number
  resetAt: number
  updatedAt: string
}

const LOW_QUOTA_THRESHOLD = 10
/**
 * Longest reset we will sit out inline. X-Ratelimit-Reset is the monthly rollover,
 * so an exhausted quota is usually days away: docs/04 says to stop new Pexels calls
 * for the job and surface `pexels_rate_limited` rather than stall silently.
 */
const MAX_INLINE_WAIT_MS = 90_000

export class PexelsRateLimitTracker {
  private static state: PexelsQuotaSnapshot | null = null

  public static updateFromHeaders(headers: Headers): PexelsQuotaSnapshot | null {
    const limit = headers.get('X-Ratelimit-Limit')
    const remaining = headers.get('X-Ratelimit-Remaining')
    const reset = headers.get('X-Ratelimit-Reset')

    if (!limit || !remaining || !reset) {
      return this.state
    }

    this.state = {
      limit: Number(limit),
      remaining: Number(remaining),
      resetAt: Number(reset),
      updatedAt: new Date().toISOString()
    }

    return this.state
  }

  public static getSnapshot(): PexelsQuotaSnapshot | null {
    return this.state
  }

  public static isLow(): boolean {
    if (!this.state) return false
    return this.state.remaining <= LOW_QUOTA_THRESHOLD
  }

  public static isExhausted(): boolean {
    if (!this.state) return false
    return this.state.remaining <= 0
  }

  public static clear(): void {
    this.state = null
  }

  /** Time until an exhausted quota resets, with a second of slack. Zero while quota remains. */
  private static resetWaitMs(): number {
    if (!this.isExhausted() || !this.state) return 0
    return Math.max(0, this.state.resetAt * 1000 - Date.now()) + 1000
  }

  /**
   * The error for a quota that is spent and resets too late to sit out, or null.
   * `waitForQuota` throws it before a request is sent, and a 429 that carries the
   * quota headers fails with it instead of being retried.
   */
  public static exhaustedError(): ApiError | null {
    if (!this.state || this.resetWaitMs() <= MAX_INLINE_WAIT_MS) return null
    return new ApiError(
      `pexels_rate_limited: Pexels API quota is exhausted until ${new Date(this.state.resetAt * 1000).toLocaleString()}.`,
      'permanent',
      429
    )
  }

  public static async waitForQuota(
    onWait?: (waitMs: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const waitMs = this.resetWaitMs()
    if (waitMs <= 0) return

    const exhausted = this.exhaustedError()
    if (exhausted) throw exhausted

    if (signal?.aborted) {
      throw new Error('Pexels quota wait aborted')
    }

    onWait?.(waitMs)

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, waitMs)

      const onAbort = (): void => {
        clearTimeout(timeoutId)
        reject(new Error('Pexels quota wait aborted'))
      }

      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
