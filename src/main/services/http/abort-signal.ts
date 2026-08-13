/**
 * Combines a timeout with an optional parent AbortSignal.
 * If the parent is already aborted, the returned signal is aborted immediately
 * (addEventListener('abort') does not fire for a past abort).
 */
export function createTimeoutLinkedSignal(
  timeoutMs: number,
  parent?: AbortSignal | null,
  onTimeout?: () => void
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()

  if (parent?.aborted) {
    controller.abort()
    return { signal: controller.signal, cleanup: (): void => undefined }
  }

  const onAbort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  parent?.addEventListener('abort', onAbort)

  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      onTimeout?.()
      controller.abort()
    }
  }, timeoutMs)

  const cleanup = (): void => {
    clearTimeout(timeoutId)
    parent?.removeEventListener('abort', onAbort)
  }

  return { signal: controller.signal, cleanup }
}
