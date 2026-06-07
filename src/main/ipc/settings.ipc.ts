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
  maxAgentIterations: z.number().min(5).max(50).optional(),
  requestTimeoutSeconds: z.number().min(10).max(180).optional(),
  skipExplicitQueries: z.boolean().optional(),
  requireApprovalBeforeDownload: z.boolean().optional(),
  avoidPeopleAndFaces: z.boolean().optional(),
  isOnboarded: z.boolean().optional(),
  theme: z.enum(['flat-black', 'flat-white']).optional(),
  hideEstimatedCost: z.boolean().optional(),
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

const PexelsKeySchema = z.string().max(512).optional()

const MASKED_SECRET = '••••••••••••••••'

function isMaskedSecret(value: string): boolean {
  return value === MASKED_SECRET
}

async function getPublicSettingsWithSecretStatus(): Promise<Record<string, unknown>> {
  const settings = await SettingsStore.getSettings()

  const openaiKey = await SecureSecrets.hasSecret('openaiKey')
  const geminiKey = await SecureSecrets.hasSecret('geminiKey')
  const openrouterKey = await SecureSecrets.hasSecret('openrouterKey')
  const pexelsKey = await SecureSecrets.hasSecret('pexelsKey')

  return {
    ...settings,
    openaiKey: openaiKey ? MASKED_SECRET : '',
    geminiKey: geminiKey ? MASKED_SECRET : '',
    openrouterKey: openrouterKey ? MASKED_SECRET : '',
    pexelsKey: pexelsKey ? MASKED_SECRET : ''
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getPublicSettings', async () => {
    return await getPublicSettingsWithSecretStatus()
  })

  ipcMain.handle('settings:updateSettings', async (_, rawInput) => {
    const input = SettingsUpdateSchema.parse(rawInput)

    // Save secure keys separately if they are provided and not masked strings
    if (input.openaiKey !== undefined && !isMaskedSecret(input.openaiKey)) {
      await SecureSecrets.setSecret('openaiKey', input.openaiKey)
    }
    if (input.geminiKey !== undefined && !isMaskedSecret(input.geminiKey)) {
      await SecureSecrets.setSecret('geminiKey', input.geminiKey)
    }
    if (input.openrouterKey !== undefined && !isMaskedSecret(input.openrouterKey)) {
      await SecureSecrets.setSecret('openrouterKey', input.openrouterKey)
    }
    if (input.pexelsKey !== undefined && !isMaskedSecret(input.pexelsKey)) {
      await SecureSecrets.setSecret('pexelsKey', input.pexelsKey)
    }

    const publicSettings = Object.fromEntries(
      Object.entries({
        llmProvider: input.llmProvider,
        modelId: input.modelId,
        downloadFolder: input.downloadFolder,
        maxConcurrentDownloads: input.maxConcurrentDownloads,
        maxAgentIterations: input.maxAgentIterations,
        requestTimeoutSeconds: input.requestTimeoutSeconds,
        skipExplicitQueries: input.skipExplicitQueries,
        requireApprovalBeforeDownload: input.requireApprovalBeforeDownload,
        avoidPeopleAndFaces: input.avoidPeopleAndFaces,
        isOnboarded: input.isOnboarded,
        theme: input.theme,
        hideEstimatedCost: input.hideEstimatedCost
      }).filter(([, value]) => value !== undefined)
    )
    await SettingsStore.updateSettings(publicSettings)
    return await getPublicSettingsWithSecretStatus()
  })

  ipcMain.handle('settings:testProvider', async (_, rawInput) => {
    const providerRequest = ProviderTestRequestSchema.parse(rawInput)
    const { provider, modelId } = providerRequest
    let { apiKey } = providerRequest
    if (apiKey === 'CURRENT_KEY_ON_DISK') {
      apiKey = await SecureSecrets.getSecret(`${provider}Key`)
    }
    const client = LlmProviderFactory.getProvider(provider)
    return await client.testConnection({ apiKey }, modelId)
  })

  ipcMain.handle('settings:testPexelsKey', async (_, rawKey: unknown) => {
    try {
      const apiKey = PexelsKeySchema.parse(rawKey) ?? ''
      let activeKey = apiKey
      if (activeKey === 'CURRENT_KEY_ON_DISK') {
        activeKey = await SecureSecrets.getSecret('pexelsKey')
      }
      const response = await fetch('https://api.pexels.com/v1/search?query=test&per_page=1', {
        headers: { Authorization: activeKey }
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
