import type { PublicSettings } from '@renderer/lib/store'
import type { LlmProvider, ProviderKeys } from './types'

export const TOTAL_STEPS = 5

export const PROVIDER_OPTIONS: { id: LlmProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' }
]

export { DEFAULT_MODEL_IDS } from '../../../../shared/llm-defaults'

/** Sentinel understood by the main process: "test the key already stored on disk". */
export const CURRENT_KEY_ON_DISK = 'CURRENT_KEY_ON_DISK'

export function stepProgressPercent(step: number): number {
  return (step / TOTAL_STEPS) * 100
}

export function errorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg || fallback
}

export interface OnboardingDraft {
  llmProvider: LlmProvider
  modelId: string
  downloadFolder: string
  keys: ProviderKeys
  pexelsKey: string
}

/** Only non-empty keys are written, so skipped steps never overwrite stored keys. */
export function buildSettingsUpdates(draft: OnboardingDraft): Partial<PublicSettings> {
  const updates: Partial<PublicSettings> = {
    llmProvider: draft.llmProvider,
    modelId: draft.modelId,
    downloadFolder: draft.downloadFolder,
    isOnboarded: true
  }
  if (draft.keys.openai) updates.openaiKey = draft.keys.openai
  if (draft.keys.gemini) updates.geminiKey = draft.keys.gemini
  if (draft.keys.openrouter) updates.openrouterKey = draft.keys.openrouter
  if (draft.pexelsKey) updates.pexelsKey = draft.pexelsKey
  return updates
}
