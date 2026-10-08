import { ipcMain } from 'electron'
import {
  checkForUpdatesNow,
  getUpdateState,
  restartToUpdate
} from '../services/updates/auto-update.ts'

export function registerUpdatesHandlers(): void {
  ipcMain.handle('app:getUpdateState', () => getUpdateState())
  ipcMain.handle('app:checkForUpdates', () => checkForUpdatesNow())
  ipcMain.handle('app:restartToUpdate', () => restartToUpdate())
}
