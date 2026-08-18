declare global {
  interface Window {
    electron: {
      process: {
        versions: NodeJS.ProcessVersions
      }
    }
    api: {
      settings: {
        getPublicSettings(): Promise<Record<string, unknown>>
        updateSettings(input: Record<string, unknown>): Promise<Record<string, unknown>>
        testProvider(input: Record<string, unknown>): Promise<Record<string, unknown>>
        testPexelsKey(key: string): Promise<Record<string, unknown>>
        chooseDownloadFolder(): Promise<string | null>
        openAppDataFolder(): Promise<void>
      }
      jobs: {
        expandIdea(input: Record<string, unknown>): Promise<Record<string, unknown>>
        start(input: Record<string, unknown>): Promise<string>
        pause(jobId: string): Promise<void>
        resume(jobId: string): Promise<void>
        approveAndResume(
          jobId: string,
          decision?: { approvedAssetIds?: string[]; rejectedAssetIds?: string[] }
        ): Promise<void>
        cancel(jobId: string): Promise<void>
        rerun(jobId: string): Promise<string>
        get(jobId: string): Promise<Record<string, unknown>>
        list(): Promise<Record<string, unknown>[]>
        delete(jobId: string): Promise<void>
        onEvent(callback: (event: Record<string, unknown>) => void): () => void
      }
      assets: {
        list(projectId: string): Promise<Record<string, unknown>[]>
        openInFolder(projectId: string, assetId: string): Promise<void>
        deleteLocal(projectId: string, assetId: string): Promise<void>
        exportManifest(projectId: string): Promise<string>
        openProjectFolder(projectId: string): Promise<void>
      }
    }
  }
}

export {}
