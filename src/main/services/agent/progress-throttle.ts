export interface TrailingThrottle {
  /** Request a call; runs once at the end of the interval no matter how often this is called. */
  schedule(): void
  /** Run a pending call now. No-op when nothing is pending. */
  flush(): void
  /** Drop a pending call. */
  cancel(): void
}

/**
 * Coalesces bursts of updates (e.g. one per download percent) into at most one
 * call per interval, so hot paths do not rebuild and broadcast state each tick.
 */
export function createTrailingThrottle(fn: () => void, intervalMs: number): TrailingThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule() {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        fn()
      }, intervalMs)
    },
    flush() {
      if (!timer) return
      clear()
      fn()
    },
    cancel: clear
  }
}
