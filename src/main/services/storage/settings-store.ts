import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

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
}

export const DEFAULT_SETTINGS: PublicSettings = {
  llmProvider: 'openai',
  modelId: 'gpt-4o',
  downloadFolder: app.getPath('downloads'),
  maxConcurrentDownloads: 3,
  maxAgentIterations: 30,
  requestTimeoutSeconds: 60,
  skipExplicitQueries: true,
  requireApprovalBeforeDownload: false,
  avoidPeopleAndFaces: false
}

export class SettingsStore {
  private static cachedSettings: PublicSettings | null = null

  public static async getSettings(): Promise<PublicSettings> {
    if (this.cachedSettings) return this.cachedSettings

    try {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8')
      const parsed = JSON.parse(data)
      this.cachedSettings = { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      this.cachedSettings = { ...DEFAULT_SETTINGS }
    }

    return this.cachedSettings!
  }

  public static async updateSettings(updates: Partial<PublicSettings>): Promise<PublicSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...updates }

    await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8')
    this.cachedSettings = updated

    return updated
  }
}
