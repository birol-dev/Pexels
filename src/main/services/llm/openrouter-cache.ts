export const OPENROUTER_CACHE_CONTROL = { type: 'ephemeral' as const }

export function clipOpenRouterSessionId(sessionId: string): string {
  return sessionId.trim().slice(0, 256)
}

/** Sticky routing + automatic cache breakpoint for OpenRouter multi-turn jobs. */
export function applyOpenRouterPromptCache(
  payload: Record<string, unknown>,
  sessionId?: string
): void {
  payload.cache_control = OPENROUTER_CACHE_CONTROL
  const clipped = sessionId ? clipOpenRouterSessionId(sessionId) : ''
  if (clipped) {
    payload.session_id = clipped
    payload.prompt_cache_key = clipped
  }
}
