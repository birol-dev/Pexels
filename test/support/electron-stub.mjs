import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// node --test runs each test file in its own process, so each file gets its own userData.
const userData = mkdtempSync(join(tmpdir(), 'stockfinder-test-'))

/** What the code under test asked the OS to do, for assertions. */
export const calls = { trashed: [], opened: [], shownInFolder: [], openedExternal: [] }

export const app = {
  getPath: (name) => (name === 'userData' ? userData : join(userData, name)),
  getVersion: () => '0.0.0-test',
  isPackaged: false
}

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`test:${value}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').replace(/^test:/, '')
}

export const shell = {
  async trashItem(path) {
    calls.trashed.push(path)
    await rm(path, { recursive: true, force: true })
  },
  async openPath(path) {
    calls.opened.push(path)
    return ''
  },
  showItemInFolder(path) {
    calls.shownInFolder.push(path)
  },
  async openExternal(url) {
    calls.openedExternal.push(url)
  }
}

const handlers = new Map()

export const ipcMain = {
  handle: (channel, handler) => handlers.set(channel, handler),
  removeHandler: (channel) => handlers.delete(channel)
}

/** Calls a registered IPC handler the way the renderer would. */
export function invokeIpc(channel, ...args) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No IPC handler registered for ${channel}`)
  return handler({ sender: null }, ...args)
}

export const BrowserWindow = { getAllWindows: () => [] }
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }

export default { app, safeStorage, shell, ipcMain, BrowserWindow, dialog }
