/**
 * Auto-update decisions shared by the main process (when to check, what to tell the
 * user) and the renderer (when to show the banner). It has no imports, so Node's test
 * runner can load it directly and neither process pulls in electron-updater through it.
 */

export const UPDATE_FIRST_CHECK_DELAY_MS = 10_000
/** How often an installed copy asks GitHub Releases for a newer version. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type UpdateUnavailableReason = 'development' | 'macos-unsigned'

/**
 * Why this build cannot update itself, or null when it can. Development builds have no
 * feed to read. macOS builds are unsigned, and Squirrel.Mac refuses unsigned updates.
 */
export function updateUnavailableReason(env: {
  isPackaged: boolean
  platform: string
}): UpdateUnavailableReason | null {
  if (!env.isPackaged) return 'development'
  if (env.platform === 'darwin') return 'macos-unsigned'
  return null
}

export function describeUpdateUnavailable(reason: UpdateUnavailableReason): string {
  return reason === 'development'
    ? 'Update checks are off in development builds.'
    : 'Automatic updates are not available on macOS yet. Download new versions from GitHub Releases.'
}

/** What the renderer needs to know about updates. */
export interface UpdateState {
  unavailableReason: UpdateUnavailableReason | null
  /** Version of an update that is downloaded and waiting for a restart. */
  readyVersion: string | null
  jobRunning: boolean
}

export type UpdateCheckResult =
  | { status: 'unavailable'; message: string }
  | { status: 'up-to-date'; message: string }
  | { status: 'downloading'; version: string; message: string }
  | { status: 'ready'; version: string; message: string }
  | { status: 'error'; message: string }

/**
 * A scheduled check skips when the user turned checks off, when one is already running,
 * and when an update is already downloaded (nothing newer can be installed before the
 * restart, so asking again only costs bandwidth).
 */
export function shouldRunScheduledCheck(state: {
  enabled: boolean
  checking: boolean
  readyVersion: string | null
}): boolean {
  return state.enabled && !state.checking && state.readyVersion === null
}

/** The banner needs a downloaded update, and must never appear while a job is running. */
export function shouldShowUpdateBanner(state: {
  readyVersion: string | null
  jobRunning: boolean
}): boolean {
  return state.readyVersion !== null && !state.jobRunning
}

export function updateReadyMessage(version: string): string {
  return `Version ${version} is ready. Restart to update.`
}

/**
 * One short line for the UI. Failed checks produce long messages, such as an HTTP error
 * followed by the response headers, and the user needs only the first line.
 */
export function summarizeUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const firstLine = raw.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const text = firstLine || 'unknown error'
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}
