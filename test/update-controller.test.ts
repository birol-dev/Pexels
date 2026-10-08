import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import {
  createUpdateController,
  type UpdateControllerDeps,
  type UpdaterLike
} from '../src/main/services/updates/update-controller.ts'
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS
} from '../src/shared/update-policy.ts'

type CheckResult = Awaited<ReturnType<UpdaterLike['checkForUpdates']>>

/** A stand-in for electron-updater's autoUpdater. This test never imports the real one. */
class FakeUpdater implements UpdaterLike {
  autoDownload = false
  autoInstallOnAppQuit = false
  checks = 0
  nextCheck: () => Promise<CheckResult> = async () => ({
    isUpdateAvailable: false,
    updateInfo: { version: '1.0.0' }
  })
  private listeners = new Map<string, (arg: never) => void>()
  private events: string[]

  // No parameter properties: Node's type stripping only removes syntax, it does not transform.
  constructor(events: string[]) {
    this.events = events
  }

  on(event: string, listener: (arg: never) => void): this {
    this.listeners.set(event, listener)
    return this
  }

  emit(event: string, arg: unknown): void {
    this.listeners.get(event)?.(arg as never)
  }

  listening(): string[] {
    return [...this.listeners.keys()]
  }

  async checkForUpdates(): Promise<CheckResult> {
    this.checks++
    return await this.nextCheck()
  }

  quitAndInstall(): void {
    this.events.push('quitAndInstall')
  }
}

interface Harness {
  updater: FakeUpdater
  events: string[]
  notified: string[]
  logged: { info: unknown[][]; error: unknown[][] }
  settings: { enabled: boolean; jobRunning: boolean | Error; pauseFails: boolean }
  controller: ReturnType<typeof createUpdateController>
}

function harness(
  env: Partial<Pick<UpdateControllerDeps, 'isPackaged' | 'platform'>> = {}
): Harness {
  const events: string[] = []
  const updater = new FakeUpdater(events)
  const notified: string[] = []
  const logged = { info: [] as unknown[][], error: [] as unknown[][] }
  const settings = { enabled: true, jobRunning: false as boolean | Error, pauseFails: false }
  const controller = createUpdateController({
    updater,
    isPackaged: env.isPackaged ?? true,
    platform: env.platform ?? 'win32',
    isEnabled: async () => settings.enabled,
    isJobRunning: async () => {
      if (settings.jobRunning instanceof Error) throw settings.jobRunning
      return settings.jobRunning
    },
    pauseJobs: async () => {
      events.push('pauseJobs')
      if (settings.pauseFails) throw new Error('disk full')
    },
    notifyUpdateReady: (version) => notified.push(version),
    log: {
      info: (...args) => logged.info.push(args),
      error: (...args) => logged.error.push(args)
    }
  })
  return { updater, events, notified, logged, settings, controller }
}

/** Lets promise callbacks queued by a fired timer finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

const available = (version: string): CheckResult => ({
  isUpdateAvailable: true,
  updateInfo: { version }
})

describe('Auto-update controller', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }))
  afterEach(() => mock.timers.reset())

  describe('where updates are unavailable', () => {
    it('does nothing in a development build', async () => {
      const { controller, updater, logged } = harness({ isPackaged: false })

      controller.start()
      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS * 2)
      await settle()

      assert.equal(updater.checks, 0)
      assert.deepEqual(updater.listening(), [])
      assert.equal(updater.autoDownload, false)
      assert.deepEqual(logged.info, [])
    })

    it('skips macOS with a log line, because the builds are unsigned', async () => {
      const { controller, updater, logged } = harness({ platform: 'darwin' })

      controller.start()
      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS * 2)
      await settle()

      assert.equal(updater.checks, 0)
      assert.equal(logged.info.length, 1)
      assert.match(String(logged.info[0][0]), /macOS/)
    })

    it('answers "check now" without asking the updater, and refuses to restart', async () => {
      const { controller, updater } = harness({ isPackaged: false })

      const result = await controller.checkNow()

      assert.equal(result.status, 'unavailable')
      assert.equal(updater.checks, 0)
      await assert.rejects(() => controller.restart(), /no update/i)
      assert.equal((await controller.getState()).unavailableReason, 'development')
    })
  })

  describe('scheduled checks', () => {
    it('checks shortly after launch and then every six hours', async () => {
      const { controller, updater } = harness()

      controller.start()
      assert.equal(updater.autoDownload, true)
      assert.equal(updater.autoInstallOnAppQuit, true)
      assert.equal(updater.checks, 0, 'nothing runs while the app is still starting')

      mock.timers.tick(UPDATE_FIRST_CHECK_DELAY_MS)
      await settle()
      assert.equal(updater.checks, 1)

      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS)
      await settle()
      assert.equal(updater.checks, 2)

      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS)
      await settle()
      assert.equal(updater.checks, 3)
    })

    it('skips scheduled checks while the setting is off, but "check now" still works', async () => {
      const { controller, updater, settings } = harness()
      settings.enabled = false

      controller.start()
      mock.timers.tick(UPDATE_FIRST_CHECK_DELAY_MS + UPDATE_CHECK_INTERVAL_MS)
      await settle()
      assert.equal(updater.checks, 0)

      const result = await controller.checkNow()
      assert.equal(result.status, 'up-to-date')
      assert.equal(updater.checks, 1)
    })

    it('picks the setting up again without a restart', async () => {
      const { controller, updater, settings } = harness()
      settings.enabled = false
      controller.start()
      mock.timers.tick(UPDATE_FIRST_CHECK_DELAY_MS)
      await settle()
      assert.equal(updater.checks, 0)

      settings.enabled = true
      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS)
      await settle()

      assert.equal(updater.checks, 1)
    })

    it('stops checking once an update is downloaded', async () => {
      const { controller, updater } = harness()
      controller.start()
      updater.emit('update-downloaded', { version: '1.4.0' })

      mock.timers.tick(UPDATE_FIRST_CHECK_DELAY_MS + UPDATE_CHECK_INTERVAL_MS)
      await settle()

      assert.equal(updater.checks, 0)
    })

    it('keeps running after a failed check', async () => {
      const { controller, updater } = harness()
      updater.nextCheck = async () => {
        throw new Error('getaddrinfo ENOTFOUND github.com')
      }
      controller.start()

      mock.timers.tick(UPDATE_FIRST_CHECK_DELAY_MS)
      await settle()
      mock.timers.tick(UPDATE_CHECK_INTERVAL_MS)
      await settle()

      assert.equal(updater.checks, 2)
    })
  })

  describe('"check now"', () => {
    it('reports a newer version that is downloading', async () => {
      const { controller, updater } = harness()
      updater.nextCheck = async () => available('1.4.0')

      const result = await controller.checkNow()

      assert.equal(result.status, 'downloading')
      assert.equal(result.status === 'downloading' && result.version, '1.4.0')
    })

    it('reports a failure as one short line instead of throwing', async () => {
      const { controller, updater } = harness()
      updater.nextCheck = async () => {
        throw new Error('HTTP 404\nheaders: {"server":"github"}')
      }

      const result = await controller.checkNow()

      assert.equal(result.status, 'error')
      assert.equal(result.message, 'Could not check for updates: HTTP 404')
    })

    it('shares one request between overlapping checks', async () => {
      const { controller, updater } = harness()
      let finish: (value: CheckResult) => void = () => {}
      updater.nextCheck = () => new Promise<CheckResult>((resolve) => (finish = resolve))

      const first = controller.checkNow()
      const second = controller.checkNow()
      await settle()
      finish(available('1.4.0'))
      const results = await Promise.all([first, second])

      assert.equal(updater.checks, 1)
      assert.deepEqual(results[0], results[1])

      updater.nextCheck = async () => available('1.4.0')
      await controller.checkNow()
      assert.equal(updater.checks, 2, 'a finished check does not block the next one')
    })

    it('reports the downloaded version instead of asking again', async () => {
      const { controller, updater } = harness()
      controller.start()
      updater.emit('update-downloaded', { version: '1.4.0' })

      const result = await controller.checkNow()

      assert.equal(result.status, 'ready')
      assert.equal(result.message, 'Version 1.4.0 is ready. Restart to update.')
      assert.equal(updater.checks, 0)
    })
  })

  describe('a downloaded update', () => {
    it('is announced once and shows in the state', async () => {
      const { controller, updater, notified } = harness()
      controller.start()

      updater.emit('update-downloaded', { version: '1.4.0' })

      assert.deepEqual(notified, ['1.4.0'])
      assert.deepEqual(await controller.getState(), {
        unavailableReason: null,
        readyVersion: '1.4.0',
        jobRunning: false
      })
    })

    it('reports whether a job is running, and assumes one is when it cannot tell', async () => {
      const { controller, settings } = harness()

      settings.jobRunning = true
      assert.equal((await controller.getState()).jobRunning, true)

      settings.jobRunning = new Error('project list unreadable')
      assert.equal((await controller.getState()).jobRunning, true)

      settings.jobRunning = false
      assert.equal((await controller.getState()).jobRunning, false)
    })

    it('pauses the jobs before it installs', async () => {
      const { controller, updater, events } = harness()
      controller.start()
      updater.emit('update-downloaded', { version: '1.4.0' })

      await controller.restart()

      assert.deepEqual(events, ['pauseJobs', 'quitAndInstall'])
    })

    it('still installs when pausing the jobs fails, and logs why', async () => {
      const { controller, updater, events, settings, logged } = harness()
      settings.pauseFails = true
      controller.start()
      updater.emit('update-downloaded', { version: '1.4.0' })

      await controller.restart()

      assert.deepEqual(events, ['pauseJobs', 'quitAndInstall'])
      assert.equal(logged.error.length, 1)
    })

    it('refuses to restart when nothing was downloaded', async () => {
      const { controller, events } = harness()
      controller.start()

      await assert.rejects(() => controller.restart(), /no update/i)

      assert.deepEqual(events, [])
    })
  })

  describe('updater errors', () => {
    it('are logged instead of thrown, because the updater throws on an unhandled error event', () => {
      const { controller, updater, logged } = harness()
      controller.start()

      assert.ok(updater.listening().includes('error'))
      updater.emit('error', new Error('download interrupted'))

      assert.equal(logged.error.length, 1)
    })
  })
})
