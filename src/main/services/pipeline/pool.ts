/**
 * Limits how many tasks run at once. Tasks beyond the limit wait for a slot, in the order they
 * asked. Once the signal aborts, a task that has not started throws the signal's reason instead of
 * starting, so a paused or cancelled job stops making requests.
 */
export function createPool(
  size: number,
  signal?: AbortSignal
): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    while (active >= size) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active++
    try {
      // Inside the try, so a task that never starts still passes its slot to the next in line.
      signal?.throwIfAborted()
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

/** The first failure among settled tasks, or undefined when every one succeeded. */
export function firstFailure(
  results: Array<PromiseSettledResult<unknown>>
): { reason: unknown } | undefined {
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  return failed ? { reason: failed.reason } : undefined
}
