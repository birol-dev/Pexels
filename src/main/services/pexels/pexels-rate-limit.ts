export interface PexelsQuotaSnapshot {
  limit: number
  remaining: number
  resetAt: number
  updatedAt: string
}

const LOW_QUOTA_THRESHOLD = 10
const MAX_WAIT_MS = 3_600_000

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

  public static async waitForQuota(
    onWait?: (waitMs: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.isExhausted() || !this.state) return

    const waitMs = Math.min(MAX_WAIT_MS, Math.max(0, this.state.resetAt * 1000 - Date.now()) + 1000)

    if (waitMs <= 0) return

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
