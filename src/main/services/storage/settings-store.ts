import { app } from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'

export interface PublicSettings {
  llmProvider: 'openai' | 'openrouter' | 'gemini'
  modelId: string
  downloadFolder: string
  maxConcurrentDownloads: number
  maxAgentIterations: number
  requestTimeoutSeconds: number
  skipExplicitQueries: boolean
  requireApprovalBeforeDownload: boolean
  avoidPeopleAndFaces: boolean
  isOnboarded: boolean
  theme: 'flat-black' | 'flat-white'
  hideEstimatedCost?: boolean
}

let settingsFile: string | null = null
function getSettingsFile(): string {
  if (!settingsFile) {
    settingsFile = join(app.getPath('userData'), 'settings.json')
  }
  return settingsFile
}

let defaultSettings: PublicSettings | null = null
export function getDefaultSettings(): PublicSettings {
  if (!defaultSettings) {
    defaultSettings = {
      llmProvider: 'openai',
      modelId: 'gpt-4o',
      downloadFolder: app.getPath('downloads'),
      maxConcurrentDownloads: 3,
      maxAgentIterations: 30,
      requestTimeoutSeconds: 60,
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
    } catch {
      this.cachedSettings = { ...fallback }
    }

    return this.cachedSettings!
  }

  public static async updateSettings(updates: Partial<PublicSettings>): Promise<PublicSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...updates }
    const filePath = getSettingsFile()

    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    this.cachedSettings = updated

    return updated
  }
}
