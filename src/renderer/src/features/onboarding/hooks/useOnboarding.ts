import { useCallback, useState } from 'react'
import { useAppStore } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import type { LlmProvider, ProviderKeys, TestResult } from '../types'
import {
  buildSettingsUpdates,
  CURRENT_KEY_ON_DISK,
  DEFAULT_MODEL_IDS,
  errorMessage
} from '../utils'
import { useConnectionTest, type ConnectionTest } from './useConnectionTest'

export interface OnboardingController {
  step: number
  goTo: (step: number) => void
  llmProvider: LlmProvider
  selectProvider: (provider: LlmProvider) => void
  activeKey: string
  setActiveKey: (value: string) => void
  modelId: string
  setModelId: (value: string) => void
  llmTest: ConnectionTest
  pexelsKey: string
  setPexelsKey: (value: string) => void
  pexelsTest: ConnectionTest
  downloadFolder: string
  chooseFolder: () => Promise<void>
  /** A key for the chosen provider was typed here or is already stored. */
  hasLlmKey: boolean
  hasPexelsKey: boolean
  finishing: boolean
  finishError: string | null
  finish: () => Promise<void>
}

export function useOnboarding(): OnboardingController {
  const updateSettings = useAppStore((s) => s.updateSettings)
  const settings = useAppStore((s) => s.settings)

  const [step, setStep] = useState(1)
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai')
  const [keys, setKeys] = useState<ProviderKeys>({ openai: '', gemini: '', openrouter: '' })
  const [modelId, setModelId] = useState(DEFAULT_MODEL_IDS.openai)
  const [pexelsKey, setPexelsKey] = useState('')
  const [downloadFolder, setDownloadFolder] = useState(settings?.downloadFolder || '')
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const activeKey = keys[llmProvider]
  // After "Reset onboarding" the keys are still stored, so a blank field is not a missing key.
  const hasLlmKey = Boolean(activeKey.trim()) || Boolean(settings?.[`${llmProvider}Key`])
  const hasPexelsKey = Boolean(pexelsKey.trim()) || Boolean(settings?.pexelsKey)

  const checkLlm = useCallback(async (): Promise<TestResult> => {
    const result = await api.settings.testProvider({
      provider: llmProvider,
      apiKey: activeKey || CURRENT_KEY_ON_DISK,
      modelId
    })
    return result as unknown as TestResult
  }, [llmProvider, activeKey, modelId])

  const checkPexels = useCallback(async (): Promise<TestResult> => {
    const result = await api.settings.testPexelsKey(pexelsKey || CURRENT_KEY_ON_DISK)
    return result as unknown as TestResult
  }, [pexelsKey])

  const llmTest = useConnectionTest(checkLlm, 'Connection test failed.')
  const pexelsTest = useConnectionTest(checkPexels, 'Pexels test failed.')
  const resetLlmTest = llmTest.reset

  const selectProvider = useCallback(
    (provider: LlmProvider): void => {
      setLlmProvider(provider)
      setModelId(DEFAULT_MODEL_IDS[provider])
      resetLlmTest()
    },
    [resetLlmTest]
  )

  const setActiveKey = useCallback(
    (value: string): void => setKeys((prev) => ({ ...prev, [llmProvider]: value })),
    [llmProvider]
  )

  const chooseFolder = useCallback(async (): Promise<void> => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) setDownloadFolder(folder)
  }, [])

  const finish = useCallback(async (): Promise<void> => {
    setFinishing(true)
    setFinishError(null)
    try {
      await updateSettings(
        buildSettingsUpdates({ llmProvider, modelId, downloadFolder, keys, pexelsKey })
      )
    } catch (err) {
      // For example the OS keychain is unavailable. Without this the button silently does nothing.
      setFinishError(errorMessage(err, 'Unknown error.'))
      setFinishing(false)
    }
  }, [updateSettings, llmProvider, modelId, downloadFolder, keys, pexelsKey])

  return {
    step,
    goTo: setStep,
    llmProvider,
    selectProvider,
    activeKey,
    setActiveKey,
    modelId,
    setModelId,
    llmTest,
    pexelsKey,
    setPexelsKey,
    pexelsTest,
    downloadFolder,
    chooseFolder,
    hasLlmKey,
    hasPexelsKey,
    finishing,
    finishError,
    finish
  }
}
