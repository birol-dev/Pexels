import assert from 'node:assert/strict'
import { afterEach, before, describe, it } from 'node:test'
import { registerSettingsHandlers } from '../src/main/ipc/settings.ipc.ts'
import { SettingsStore } from '../src/main/services/storage/settings-store.ts'
import { dialog, invokeIpc } from './support/electron-stub.mjs'

type PickerOptions = { properties?: string[]; defaultPath?: string }

const originalPicker = dialog.showOpenDialog

describe('Download folder picker', () => {
  before(() => registerSettingsHandlers())

  afterEach(() => {
    dialog.showOpenDialog = originalPicker
  })

  const pickerReturning = (filePaths: string[]): { opened: PickerOptions[] } => {
    const opened: PickerOptions[] = []
    dialog.showOpenDialog = (async (options: PickerOptions) => {
      opened.push(options)
      return { canceled: filePaths.length === 0, filePaths }
    }) as typeof dialog.showOpenDialog
    return { opened }
  }

  it('opens at the current download folder', async () => {
    await SettingsStore.updateSettings({ downloadFolder: 'C:\\Stock\\Footage' })
    const { opened } = pickerReturning(['C:\\Stock\\Other'])

    const picked = await invokeIpc('settings:chooseDownloadFolder')

    assert.equal(picked, 'C:\\Stock\\Other')
    assert.equal(opened.length, 1)
    assert.equal(opened[0].defaultPath, 'C:\\Stock\\Footage')
    assert.deepEqual(opened[0].properties, ['openDirectory'])
  })

  it('returns null when the dialog is cancelled', async () => {
    pickerReturning([])

    assert.equal(await invokeIpc('settings:chooseDownloadFolder'), null)
  })

  it('does not pass an empty default path', async () => {
    await SettingsStore.updateSettings({ downloadFolder: '' })
    const { opened } = pickerReturning(['C:\\Stock\\Other'])

    await invokeIpc('settings:chooseDownloadFolder')

    assert.ok(!('defaultPath' in opened[0]), 'the dialog keeps the system default')
  })
})
