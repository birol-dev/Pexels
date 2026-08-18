import { SettingsStore } from '../storage/settings-store.ts'
import { ApiError } from '../http/api-errors.ts'

const WINDOW_MS = 60_000

export class LlmRateLimiter {
  private static requestTimestamps: number[] = []
  private static queue: Promise<void> = Promise.resolve()
  private static customLimit: number | null = null

  /**
   * Set a custom limit override (useful for testing or specific workflows).
   * Pass null to revert to the value in SettingsStore.
   */
  public static setCustomLimit(limit: number | null): void {
    this.customLimit = limit
  }

  /**
   * Clear all recorded request timestamps and reset queue.
   */
  public static clear(): void {
    this.requestTimestamps = []
    this.customLimit = null
    this.queue = Promise.resolve()
  }

  /**
   * Returns current active requests per minute (RPM) limit.
   */
  public static async getActiveLimit(explicitRpm?: number): Promise<number> {
    if (typeof explicitRpm === 'number') {
      return explicitRpm
    }
    if (this.customLimit !== null) {
      return this.customLimit
    }
    try {
      const settings = await SettingsStore.getSettings()
      return typeof settings.requestsPerMinute === 'number' ? settings.requestsPerMinute : 0
    } catch {
      return 0
    }
  }

  /**
   * Waits for an available rate limit slot before sending an outbound request.
   * If requestsPerMinute <= 0, resolves immediately.
   */
  public static async waitForSlot(
    signal?: AbortSignal,
    explicitRpm?: number,
    onWait?: (waitMs: number) => void
  ): Promise<void> {
    if (signal?.aborted) {
      throw new ApiError('Request aborted before rate limit slot', 'permanent')
    }

    const previousQueue = this.queue

    let unlockQueue: () => void = () => {}
    this.queue = new Promise<void>((resolve) => {
      unlockQueue = resolve
    })

    try {
      // Wait for any prior queued request to finish slot calculation/reservation
      await previousQueue

      if (signal?.aborted) {
        throw new ApiError('Request aborted while waiting in rate limit queue', 'permanent')
      }

      const rpm = await this.getActiveLimit(explicitRpm)
      if (rpm <= 0) {
        return
      }

      const now = Date.now()
      this.pruneExpired(now)

      if (this.requestTimestamps.length >= rpm) {
        const oldestIndex = this.requestTimestamps.length - rpm
        const oldestTimestamp = this.requestTimestamps[oldestIndex]
        const waitMs = Math.max(0, oldestTimestamp + WINDOW_MS - now + 50)

        if (waitMs > 0) {
          onWait?.(waitMs)
          await this.sleepWithAbort(waitMs, signal)
          this.pruneExpired(Date.now())
        }
      }

      if (signal?.aborted) {
        throw new ApiError('Request aborted during rate limit wait', 'permanent')
      }

      this.requestTimestamps.push(Date.now())
    } finally {
      unlockQueue()
    }
  }

  private static pruneExpired(now: number): void {
    const cutoff = now - WINDOW_MS
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] <= cutoff) {
      this.requestTimestamps.shift()
    }
  }

  private static sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ApiError('Request aborted during rate limit wait', 'permanent'))
        return
      }

      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      const onAbort = (): void => {
        clearTimeout(timeoutId)
        reject(new ApiError('Request aborted during rate limit wait', 'permanent'))
      }

      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
