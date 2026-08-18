import { contextBridge, ipcRenderer } from 'electron'

// Expose the custom AppApi to the renderer
const electron = {
  process: {
    versions: process.versions
  }
}

const api = {
  settings: {
    getPublicSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:getPublicSettings'),
    updateSettings: (input: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:updateSettings', input),
    testProvider: (input: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:testProvider', input),
    testPexelsKey: (key: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:testPexelsKey', key),
    chooseDownloadFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('settings:chooseDownloadFolder'),
    openAppDataFolder: (): Promise<void> => ipcRenderer.invoke('settings:openAppDataFolder')
  },
  jobs: {
    expandIdea: (input: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('jobs:expandIdea', input),
    start: (input: Record<string, unknown>): Promise<string> =>
      ipcRenderer.invoke('jobs:start', input),
    pause: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:pause', jobId),
    resume: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:resume', jobId),
    approveAndResume: (
      jobId: string,
      decision?: { approvedAssetIds?: string[]; rejectedAssetIds?: string[] }
    ): Promise<void> => ipcRenderer.invoke('jobs:approveAndResume', jobId, decision),
    cancel: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:cancel', jobId),
    rerun: (jobId: string): Promise<string> => ipcRenderer.invoke('jobs:rerun', jobId),
    get: (jobId: string): Promise<Record<string, unknown>> => ipcRenderer.invoke('jobs:get', jobId),
    list: (): Promise<Record<string, unknown>[]> => ipcRenderer.invoke('jobs:list'),
    delete: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:delete', jobId),
    onEvent: (callback: (event: Record<string, unknown>) => void): (() => void) => {
      const listener = (_event: unknown, data: Record<string, unknown>): void => callback(data)
      ipcRenderer.on('jobs:event', listener)
      return (): void => {
        ipcRenderer.removeListener('jobs:event', listener)
      }
    }
  },
  assets: {
    list: (projectId: string): Promise<Record<string, unknown>[]> =>
      ipcRenderer.invoke('assets:list', projectId),
    openInFolder: (projectId: string, assetId: string): Promise<void> =>
      ipcRenderer.invoke('assets:openInFolder', projectId, assetId),
    deleteLocal: (projectId: string, assetId: string): Promise<void> =>
      ipcRenderer.invoke('assets:deleteLocal', projectId, assetId),
    exportManifest: (projectId: string): Promise<string> =>
      ipcRenderer.invoke('assets:exportManifest', projectId),
    openProjectFolder: (projectId: string): Promise<void> =>
      ipcRenderer.invoke('assets:openProjectFolder', projectId)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electron)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose preload API:', error)
}
