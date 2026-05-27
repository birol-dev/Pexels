import { ipcMain, dialog, shell, app } from 'electron'
import { SettingsStore } from '../services/storage/settings-store'
import { SecureSecrets } from '../services/storage/secure-secrets'
import { LlmProviderFactory } from '../services/llm/llm-provider'
import { z } from 'zod'

const SettingsUpdateSchema = z.object({
  llmProvider: z.enum(['openai', 'openrouter', 'gemini']).optional(),
  modelId: z.string().optional(),
  downloadFolder: z.string().optional(),
  maxConcurrentDownloads: z.number().min(1).max(10).optional(),
  maxAgentIterations: z.number().min(5).max(100).optional(),
  requestTimeoutSeconds: z.number().min(5).max(300).optional(),
  skipExplicitQueries: z.boolean().optional(),
  requireApprovalBeforeDownload: z.boolean().optional(),
  avoidPeopleAndFaces: z.boolean().optional(),
  // Keys are sent in the update payload but stored securely in Keychain, not in settings.json
  openaiKey: z.string().optional(),
  geminiKey: z.string().optional(),
  openrouterKey: z.string().optional(),
  pexelsKey: z.string().optional()
})

const ProviderTestRequestSchema = z.object({
  provider: z.enum(['openai', 'openrouter', 'gemini']),
  apiKey: z.string(),
  modelId: z.string()
})

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getPublicSettings', async () => {
    return await SettingsStore.getSettings()
  })

  ipcMain.handle('settings:updateSettings', async (_, rawInput) => {
    const input = SettingsUpdateSchema.parse(rawInput)
    
    // Save secure keys separately
    if (input.openaiKey !== undefined) await SecureSecrets.setSecret('openaiKey', input.openaiKey)
    if (input.geminiKey !== undefined) await SecureSecrets.setSecret('geminiKey', input.geminiKey)
    if (input.openrouterKey !== undefined) await SecureSecrets.setSecret('openrouterKey', input.openrouterKey)
    if (input.pexelsKey !== undefined) await SecureSecrets.setSecret('pexelsKey', input.pexelsKey)

    // Filter out keys from public settings saving
    const { openaiKey, geminiKey, openrouterKey, pexelsKey, ...publicSettings } = input
    await SettingsStore.updateSettings(publicSettings)
  })

  ipcMain.handle('settings:testProvider', async (_, rawInput) => {
    const { provider, apiKey, modelId } = ProviderTestRequestSchema.parse(rawInput)
    const client = LlmProviderFactory.getProvider(provider)
    return await client.testConnection({ apiKey }, modelId)
  })

  ipcMain.handle('settings:testPexelsKey', async (_, apiKey: string) => {
    try {
      const response = await fetch('https://api.pexels.com/v1/search?query=test&per_page=1', {
        headers: { 'Authorization': apiKey }
      })
      if (response.ok) {
        return { success: true, message: 'Pexels API key is valid!' }
      }
      return { success: false, message: `Pexels API error: HTTP ${response.status}` }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('settings:chooseDownloadFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('settings:openAppDataFolder', async () => {
    const appDataPath = app.getPath('userData')
    await shell.openPath(appDataPath)
  })
}
