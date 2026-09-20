import * as electron from 'electron'
import { join } from 'path'
import os from 'os'
import { loadRecoverableJson, writeJsonAtomic } from './state-file-recovery.ts'

export interface PublicSettings {
  llmProvider: 'openai' | 'openrouter' | 'gemini'
  modelId: string
  downloadFolder: string
  maxConcurrentDownloads: number
  maxAgentIterations: number
  requestTimeoutSeconds: number
  requestsPerMinute: number
  skipExplicitQueries: boolean
  requireApprovalBeforeDownload: boolean
  avoidPeopleAndFaces: boolean
  isOnboarded: boolean
  theme: 'flat-black' | 'flat-white'
  hideEstimatedCost?: boolean
}

function getAppPath(name: 'userData' | 'downloads'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const electronApp = (electron as any)?.app || (electron as any)?.default?.app
  if (electronApp?.getPath) {
    try {
      return electronApp.getPath(name)
    } catch {
      // Fall through to fallback
    }
  }
  if (name === 'userData') {
    return join(os.homedir(), '.stockfinder-ai')
  }
  return join(os.homedir(), 'Downloads')
}

let settingsFile: string | null = null
function getSettingsFile(): string {
  if (!settingsFile) {
    settingsFile = join(getAppPath('userData'), 'settings.json')
  }
  return settingsFile
}

let defaultSettings: PublicSettings | null = null
export function getDefaultSettings(): PublicSettings {
  if (!defaultSettings) {
    defaultSettings = {
      llmProvider: 'openai',
      modelId: 'gpt-4o',
      downloadFolder: getAppPath('downloads'),
      maxConcurrentDownloads: 3,
      maxAgentIterations: 30,
      requestTimeoutSeconds: 60,
      requestsPerMinute: 0,
      skipExplicitQueries: true,
      requireApprovalBeforeDownload: false,
      avoidPeopleAndFaces: false,
      isOnboarded: false,
      theme: 'flat-black',
      hideEstimatedCost: false
    }
  }
  return defaultSettings
}

export class SettingsStore {
  private static cachedSettings: PublicSettings | null = null
  private static writeQueue: Promise<void> = Promise.resolve()

  public static async getSettings(): Promise<PublicSettings> {
    if (this.cachedSettings) return this.cachedSettings

    const filePath = getSettingsFile()
    const fallback = getDefaultSettings()
    const result = await loadRecoverableJson<Record<string, unknown>>(
      filePath,
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    )
    if (result.status === 'unavailable') {
      throw result.error
    }
    this.cachedSettings = {
      ...fallback,
      ...(result.status === 'ok' ? (result.value as Partial<PublicSettings>) : {})
    }

    return this.cachedSettings
  }

  public static async updateSettings(updates: Partial<PublicSettings>): Promise<PublicSettings> {
    this.writeQueue = this.writeQueue
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(async () => {
        const current = await this.getSettings()
        const updated = { ...current, ...updates }
        await writeJsonAtomic(getSettingsFile(), updated)
        this.cachedSettings = updated
      })
    await this.writeQueue
    return this.cachedSettings!
  }
}
