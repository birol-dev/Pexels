import type { PublicSettings } from '@renderer/lib/store'

export type LlmProvider = PublicSettings['llmProvider']

export interface TestResult {
  success: boolean
  message: string
}

export interface ProviderKeys {
  openai: string
  gemini: string
  openrouter: string
}

export const WIZARD_STEPS = ['welcome', 'ai', 'pexels', 'storage', 'finish'] as const
