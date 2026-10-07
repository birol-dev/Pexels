import { loopErrorToRecord } from './tool-schemas.ts'

export interface RunTailHooks {
  getStatus(): string
  runLoop(): Promise<void>
  /** Called with the message of a real loop failure (never for pause/cancel aborts). */
  onLoopError(message: string): void
  settleDownloads(): Promise<void>
  finalize(): void
}

/**
 * Shared tail of every agent run (initial start, resume, post-approval resume):
 * run the loop, record only real failures, then wait for downloads and finalize
 * if the run is still live. Keeping this in one place stops the entry points
 * from drifting apart on error handling.
 */
export async function runLoopThenFinalize(hooks: RunTailHooks): Promise<void> {
  try {
    await hooks.runLoop()
  } catch (loopErr) {
    // Pause/cancel abort the in-flight request on purpose; only real failures count.
    const message = loopErrorToRecord(hooks.getStatus(), loopErr)
    if (message) hooks.onLoopError(message)
  }

  if (hooks.getStatus() === 'running') {
    await hooks.settleDownloads()
  }

  if (hooks.getStatus() === 'running') {
    hooks.finalize()
  }
}
