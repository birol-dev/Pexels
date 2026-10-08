import type { PublicSettings } from '@renderer/lib/store'
import { DEFAULT_MODEL_IDS } from '../../../../shared/llm-defaults'

export type SecretKeyField = 'openaiKey' | 'geminiKey' | 'openrouterKey' | 'pexelsKey'
export type LlmProvider = PublicSettings['llmProvider']
export type SettingsPatch = Partial<PublicSettings>
export type SecretKeys = Record<SecretKeyField, string>

export interface TestResultState {
  success: boolean
  message: string
}

export const GITHUB_REPO_URL = 'https://github.com/birol-dev/Pexels'
export const PERSIST_DEBOUNCE_MS = 300

export const SECRET_FIELDS: SecretKeyField[] = [
  'openaiKey',
  'geminiKey',
  'openrouterKey',
  'pexelsKey'
]

export const EMPTY_SECRET_KEYS: SecretKeys = {
  openaiKey: '',
  geminiKey: '',
  openrouterKey: '',
  pexelsKey: ''
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = DEFAULT_MODEL_IDS

export const PROVIDER_OPTIONS: { value: LlmProvider; label: string }[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' }
]

export const THEME_OPTIONS: { value: PublicSettings['theme']; label: string }[] = [
  { value: 'flat-white', label: 'Light Mode (Industrial)' },
  { value: 'flat-black', label: 'Dark Mode (Cyber)' }
]

export const ENGINE_OPTIONS: {
  value: NonNullable<PublicSettings['agentEngine']>
  label: string
}[] = [
  { value: 'loop', label: 'Agent loop' },
  { value: 'pipeline', label: 'Pipeline (beta)' }
]

export function secretFieldForProvider(provider: LlmProvider): SecretKeyField {
  return `${provider}Key`
}

/** Blank secrets mean "leave the stored key unchanged", so they never reach the store. */
export function stripEmptySecrets(updates: SettingsPatch): SettingsPatch {
  const next = { ...updates }
  for (const key of SECRET_FIELDS) {
    if (!(key in next)) continue
    const value = next[key]
    if (typeof value !== 'string' || !value.trim()) {
      delete next[key]
    } else {
      next[key] = value.trim()
    }
  }
  return next
}
