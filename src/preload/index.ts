import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose the custom AppApi to the renderer
const api = {
  settings: {
    getPublicSettings: () => ipcRenderer.invoke('settings:getPublicSettings'),
    updateSettings: (input: any) => ipcRenderer.invoke('settings:updateSettings', input),
    testProvider: (input: any) => ipcRenderer.invoke('settings:testProvider', input),
    testPexelsKey: (key: string) => ipcRenderer.invoke('settings:testPexelsKey', key),
    chooseDownloadFolder: () => ipcRenderer.invoke('settings:chooseDownloadFolder'),
    openAppDataFolder: () => ipcRenderer.invoke('settings:openAppDataFolder')
  },
  jobs: {
    start: (input: any) => ipcRenderer.invoke('jobs:start', input),
    pause: (jobId: string) => ipcRenderer.invoke('jobs:pause', jobId),
    resume: (jobId: string) => ipcRenderer.invoke('jobs:resume', jobId),
    approveAndResume: (jobId: string) => ipcRenderer.invoke('jobs:approveAndResume', jobId),
    cancel: (jobId: string) => ipcRenderer.invoke('jobs:cancel', jobId),
    rerun: (jobId: string) => ipcRenderer.invoke('jobs:rerun', jobId),
    get: (jobId: string) => ipcRenderer.invoke('jobs:get', jobId),
    list: () => ipcRenderer.invoke('jobs:list'),
    onEvent: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('jobs:event', listener)
      return () => {
        ipcRenderer.removeListener('jobs:event', listener)
      }
    }
  },
  assets: {
    list: (projectId: string) => ipcRenderer.invoke('assets:list', projectId),
    openInFolder: (projectId: string, assetId: string) => ipcRenderer.invoke('assets:openInFolder', projectId, assetId),
    deleteLocal: (projectId: string, assetId: string) => ipcRenderer.invoke('assets:deleteLocal', projectId, assetId),
    exportManifest: (projectId: string) => ipcRenderer.invoke('assets:exportManifest', projectId)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
