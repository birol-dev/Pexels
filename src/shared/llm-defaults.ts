/**
 * Single source of truth for provider defaults, shared by main and renderer.
 * Model ids are free text everywhere else (docs/04: no allowlist, never silently
 * replace the user's model id) — these are only the suggestions shown first.
 */
export type LlmProviderId = 'openai' | 'openrouter' | 'gemini'

export const DEFAULT_LLM_PROVIDER: LlmProviderId = 'openai'

export const DEFAULT_MODEL_IDS: Record<LlmProviderId, string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-3.8-flash',
  openrouter: 'google/gemini-2.5-flash'
}
