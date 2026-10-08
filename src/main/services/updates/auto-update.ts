import { app, BrowserWindow } from 'electron'
// electron-updater is CommonJS and defines `autoUpdater` as a lazy getter, which Node's ESM
// loader cannot see as a named export. Take it from the default export instead.
import electronUpdater from 'electron-updater'
import { AgentRunner } from '../agent/agent-runner.ts'
import { ProjectStore } from '../storage/project-store.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import type { UpdateCheckResult, UpdateState } from '../../../shared/update-policy.ts'
import { createUpdateController, type UpdateController } from './update-controller.ts'

const { autoUpdater } = electronUpdater

let controller: UpdateController | null = null

function getController(): UpdateController {
  controller ??= createUpdateController({
    updater: autoUpdater,
    isPackaged: app.isPackaged,
    platform: process.platform,
    isEnabled: async () => (await SettingsStore.getSettings()).autoCheckForUpdates !== false,
    isJobRunning: async () => {
      const projects = await ProjectStore.list()
      return projects.some(
        (project) => AgentRunner.getActive(project.jobId)?.getSnapshot().status === 'running'
      )
    },
    pauseJobs: () => AgentRunner.pauseAll(),
    notifyUpdateReady: (version) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('app:updateReady', { version })
      }
    },
    log: { info: console.log, error: console.error }
  })
  return controller
}

/**
 * Checks GitHub Releases shortly after launch and then every six hours, downloads a
 * newer version in the background, and tells the renderer when it is ready. Does nothing
 * in development, and on macOS until builds are signed.
 */
export function startAutoUpdate(): void {
  getController().start()
}

export function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  return getController().checkNow()
}

export function getUpdateState(): Promise<UpdateState> {
  return getController().getState()
}

/** Pauses running jobs so they resume after the restart, then installs. */
export function restartToUpdate(): Promise<void> {
  return getController().restart()
}
