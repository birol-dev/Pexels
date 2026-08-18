import * as electron from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import os from 'os'

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
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(data)
      this.cachedSettings = {
        ...fallback,
        ...(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        this.cachedSettings = { ...fallback }
      } else {
        throw error
      }
    }

    return this.cachedSettings!
  }

  public static async updateSettings(updates: Partial<PublicSettings>): Promise<PublicSettings> {
    this.writeQueue = this.writeQueue
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(async () => {
        const current = await this.getSettings()
        const updated = { ...current, ...updates }
        const filePath = getSettingsFile()

        await fs.mkdir(dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
        this.cachedSettings = updated
      })
    await this.writeQueue
    return this.cachedSettings!
  }
}
