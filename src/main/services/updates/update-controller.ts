import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  describeUpdateUnavailable,
  shouldRunScheduledCheck,
  summarizeUpdateError,
  updateReadyMessage,
  updateUnavailableReason,
  type UpdateCheckResult,
  type UpdateState
} from '../../../shared/update-policy.ts'

/**
 * The slice of electron-updater's `AppUpdater` the controller uses. It is a separate
 * type so this file never imports electron-updater (or electron) and tests can pass a
 * fake. Listener parameters are declared loosely because `AppUpdater` types them per event.
 */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean
    updateInfo: { version: string }
  } | null>
  quitAndInstall(): void
}

export interface UpdateControllerDeps {
  updater: UpdaterLike
  isPackaged: boolean
  platform: string
  /** Whether the user left "Check for updates automatically" on. */
  isEnabled: () => Promise<boolean>
  isJobRunning: () => Promise<boolean>
  /** Pauses running jobs and saves them, so they can be resumed after the restart. */
  pauseJobs: () => Promise<void>
  notifyUpdateReady: (version: string) => void
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

export interface UpdateController {
  /** Schedules the first check and then one every six hours. Does nothing where updates are unavailable. */
  start: () => void
  /** Checks right now, whatever the automatic-check setting says, and reports what happened. */
  checkNow: () => Promise<UpdateCheckResult>
  /** Pauses running jobs, then quits and installs the downloaded update. */
  restart: () => Promise<void>
  getState: () => Promise<UpdateState>
}

export function createUpdateController(deps: UpdateControllerDeps): UpdateController {
  const { updater, log } = deps
  const unavailableReason = updateUnavailableReason(deps)

  let readyVersion: string | null = null
  let attached = false
  let inFlight: Promise<UpdateCheckResult> | null = null

  /** Attaches the updater's listeners once. Download and install errors also arrive here. */
  function attach(): void {
    if (attached) return
    attached = true
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('update-downloaded', (info) => {
      readyVersion = info.version
      deps.notifyUpdateReady(info.version)
    })
    // electron-updater throws when it emits 'error' with no listener.
    updater.on('error', (err) => log.error('Update check failed:', err))
  }

  async function check(): Promise<UpdateCheckResult> {
    try {
      const result = await updater.checkForUpdates()
      if (!result?.isUpdateAvailable) {
        return { status: 'up-to-date', message: 'You are on the latest version.' }
      }
      const version = result.updateInfo.version
      return {
        status: 'downloading',
        version,
        message: `Version ${version} was found. It downloads in the background.`
      }
    } catch (err) {
      return {
        status: 'error',
        message: `Could not check for updates: ${summarizeUpdateError(err)}`
      }
    }
  }

  function runCheck(): Promise<UpdateCheckResult> {
    inFlight ??= check().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function checkScheduled(): Promise<void> {
    const enabled = await deps.isEnabled().catch(() => false)
    if (shouldRunScheduledCheck({ enabled, checking: inFlight !== null, readyVersion })) {
      await runCheck()
    }
  }

  return {
    start() {
      if (unavailableReason) {
        // Development has nothing to log. macOS is a decision worth leaving a trace of.
        if (unavailableReason === 'macos-unsigned') {
          log.info(
            'Auto-update is off on macOS: builds are unsigned and Squirrel.Mac refuses unsigned updates.'
          )
        }
        return
      }
      attach()
      setTimeout(() => void checkScheduled(), UPDATE_FIRST_CHECK_DELAY_MS).unref?.()
      setInterval(() => void checkScheduled(), UPDATE_CHECK_INTERVAL_MS).unref?.()
    },

    async checkNow() {
      if (unavailableReason) {
        return { status: 'unavailable', message: describeUpdateUnavailable(unavailableReason) }
      }
      if (readyVersion) {
        return { status: 'ready', version: readyVersion, message: updateReadyMessage(readyVersion) }
      }
      attach()
      return await runCheck()
    },

    async restart() {
      if (unavailableReason || !readyVersion) throw new Error('There is no update to install.')
      try {
        await deps.pauseJobs()
      } catch (err) {
        // Same as the quit path: unsaved jobs come back as paused on the next launch.
        log.error('Failed to pause running jobs before the update:', err)
      }
      updater.quitAndInstall()
    },

    async getState() {
      return {
        unavailableReason,
        readyVersion,
        // Hide the banner when unsure. Restarting pauses jobs either way.
        jobRunning: await deps.isJobRunning().catch(() => true)
      }
    }
  }
}
