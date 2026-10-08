import type { LlmProviderId } from '../../../../shared/llm-defaults'

/**
 * Remembers the model id used with each provider, so switching providers and back restores
 * the last one instead of the default. Only type imports, so Node's test runner can load
 * this file directly.
 */
export type ModelMemory = Partial<Record<LlmProviderId, string>>

export interface ProviderModelChoice {
  modelId: string
  modelIdByProvider: ModelMemory
}

/** Records `modelId` for `provider`. A blank id is ignored, so it never erases a good one. */
export function rememberModel(
  memory: ModelMemory | undefined,
  provider: LlmProviderId,
  modelId: string
): ModelMemory {
  return modelId.trim() ? { ...memory, [provider]: modelId } : { ...memory }
}

/**
 * What to apply when the user switches to `next`: the model last used with it, else its
 * default. The model in use now is remembered for the provider being left.
 */
export function switchProviderModel(
  current: { llmProvider: LlmProviderId; modelId: string; modelIdByProvider?: ModelMemory },
  next: LlmProviderId,
  defaults: Record<LlmProviderId, string>
): ProviderModelChoice {
  const modelIdByProvider = rememberModel(
    current.modelIdByProvider,
    current.llmProvider,
    current.modelId
  )
  return { modelId: modelIdByProvider[next]?.trim() || defaults[next], modelIdByProvider }
}
