/** Default HTTP timeout for Pexels and the Settings slider. */
export const DEFAULT_REQUEST_TIMEOUT_SECONDS = 60

/**
 * LLM chat completions are non-streaming: the client sees no bytes until the
 * full reply is generated. Slow OpenRouter routes (especially `:floor`) routinely
 * exceed 60s on multi-thousand-token tool calls even though the provider later
 * succeeds — which is why Settings "Test connection" (10 tokens) can pass while
 * a real job logs "Request timed out after 60 seconds."
 *
 * 32,768 completion tokens at ~55–60 tok/s (DeepInfra) needs about 9 minutes if
 * the model fills the budget, so the LLM floor matches the Settings slider max.
 */
export const MIN_LLM_REQUEST_TIMEOUT_SECONDS = 600

export const MAX_REQUEST_TIMEOUT_SECONDS = 600

export function resolveLlmRequestTimeoutSeconds(requestTimeoutSeconds?: number): number {
  const configured = Number(requestTimeoutSeconds)
  const seconds =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_SECONDS
  return Math.max(seconds, MIN_LLM_REQUEST_TIMEOUT_SECONDS)
}
