declare global {
  interface Window {
    electron: {
      process: {
        versions: NodeJS.ProcessVersions
      }
    }
    api: {
      settings: {
        getPublicSettings(): Promise<any>
        updateSettings(input: any): Promise<any>
        testProvider(input: any): Promise<any>
        testPexelsKey(key: string): Promise<any>
        chooseDownloadFolder(): Promise<string | null>
        openAppDataFolder(): Promise<void>
      }
      jobs: {
        start(input: any): Promise<string>
        pause(jobId: string): Promise<void>
        resume(jobId: string): Promise<void>
        approveAndResume(jobId: string): Promise<void>
        cancel(jobId: string): Promise<void>
        rerun(jobId: string): Promise<string>
        get(jobId: string): Promise<any>
        list(): Promise<any[]>
        onEvent(callback: (event: any) => void): () => void
      }
      assets: {
        list(projectId: string): Promise<any[]>
        openInFolder(projectId: string, assetId: string): Promise<void>
        deleteLocal(projectId: string, assetId: string): Promise<void>
        exportManifest(projectId: string): Promise<string>
      }
    }
  }
}

export {}
