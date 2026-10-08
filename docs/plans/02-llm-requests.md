# Plan 02: LLM Requests

Status: proposed · Size: M (phases 1 to 4 are S; phase 5 is M and optional) · Depends on: plan 01 phase 1

## Why

Plan 01 stops the default model from failing. This plan fixes the rest of the request layer. "Test connection" doesn't test what jobs send, the timeout setting has no effect on LLM calls, token counts are incomplete, and Gemini thinking runs unbudgeted on structured calls.

## Current state (audited)

All references are to `src/main/services/llm/llm-provider.ts` unless noted.

- **"Test connection" tests a different request than jobs send.** `testConnectionWithPing` (line 351) sends `tools: []`, `toolChoice: 'none'`, `temperature: 0.1`, and `maxOutputTokens: 10`. Jobs send forced tool calls, `temperature: 0.2` (beat split) or `0.7` (idea expansion), and 32,768 output tokens. A model that can't call tools, rejects the temperature, or has a lower output cap passes the test and then fails the job. After plan 01, the cap and temperature are learned at the first job's first call. The connection test is still the place to find out whether the model can call tools at all.
- **When the model field is empty, the test checks a different model.** The OpenAI test falls back to `gpt-4o-mini` (line 408), while jobs fall back to `gpt-4o` (line 396).
- **The LLM timeout is always 600 seconds.** In `llm-timeout.ts`, `MIN_LLM_REQUEST_TIMEOUT_SECONDS` and `MAX_REQUEST_TIMEOUT_SECONDS` are both 600, and `resolveLlmRequestTimeoutSeconds` returns `Math.max(seconds, 600)`. The "Request timeout" slider in Settings (10 to 600 seconds) affects Pexels calls and downloads, but never LLM calls. The comment in `llm-timeout.ts` explains why: requests aren't streamed, so a 32,768-token answer at about 55 tokens per second needs about 9 minutes, and the only safe wall-clock timeout is a long one. The cost is that a provider that hangs costs the user 10 minutes before anything happens.
- **Token counts are incomplete.**
  - Cached input tokens are never read. Nothing parses `cached_tokens` or `cachedContentTokenCount`, so there's no way to tell whether the cache-stable prefix (`messagesWithCacheStablePrefix` in `search-mode.ts`) is working.
  - Gemini thinking tokens are missing. The Gemini adapter maps `promptTokenCount`, `candidatesTokenCount`, and `totalTokenCount` (line 727), but not `thoughtsTokenCount`, so `outputTokens` leaves out thinking even though Google bills it as output.
- **Gemini thinking isn't budgeted.** The OpenRouter adapter sends `reasoning` settings (README line 185 describes why: a reasoning model spent its whole budget thinking and never called the tool). The Gemini adapter sends only `temperature` and `maxOutputTokens` in `generationConfig`. Gemini 2.5-series models think by default, and thinking counts toward `maxOutputTokens`, so the same failure is possible there.

## Goals

- "Test connection" fails for a model that can't do what a job needs, and says why.
- Token usage includes cached input and thinking tokens.
- Structured calls on Gemini spend little or nothing on thinking.
- The timeout setting means what its label says.

## Non-goals

- Model tables, per-model price lists, or capability lists (docs/04).
- Retrying on a different provider.

## Key decisions

| Decision                      | Choice                                                                                           | Why                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How to test a connection      | One forced call of a tiny tool, sent with the same temperature and output cap as a beat split    | It exercises tool calling, and any cap or temperature quirk is learned before the first job. The output cap is only a ceiling, so the call stays cheap. |
| How to handle Gemini thinking | Ask for a small budget on structured calls; if the API rejects it, learn that and resend without | Same learned-quirk approach as plan 01, with no model table.                                                                                            |
| Streaming                     | Optional (phase 5). Do it only if live jobs show timeouts after plan 08                          | Plan 08's calls are short. Streaming is the largest change here and only pays off for long outputs.                                                     |

## Phases

### Phase 1: A connection test that matches job requests (S)

Change `testConnectionWithPing` to send one forced tool call with job-like parameters:

```ts
const CONNECTION_TEST_TOOL: NormalizedToolDefinition = {
  name: 'report_ready',
  description: 'Confirm that the connection works.',
  parameters: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok']
  }
}

async function testConnectionWithPing(
  provider: LlmProvider,
  credentials: ProviderCredentials,
  modelId: string,
  options: { providerName: string; defaultModel: string }
): Promise<ProviderTestResult> {
  const trimmedKey = credentials.apiKey?.trim() || ''
  if (!trimmedKey) {
    return {
      success: false,
      message: `${options.providerName} API key is missing. Please enter an API key.`
    }
  }
  const model = modelId?.trim() || options.defaultModel
  try {
    const turn = await provider.createToolTurn(
      {
        model,
        systemPrompt: 'Call report_ready with ok set to true.',
        messages: [{ role: 'user', content: 'Connection test.' }],
        tools: [CONNECTION_TEST_TOOL],
        toolChoice: { name: CONNECTION_TEST_TOOL.name },
        // Same values as a beat split, so a cap or temperature quirk is learned here.
        temperature: 0.2,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
        reasoning: LLM_STRUCTURED_REASONING
      },
      { apiKey: trimmedKey }
    )
    if (!turn.toolCalls.some((call) => call.name === CONNECTION_TEST_TOOL.name)) {
      return {
        success: false,
        message: `${model} answered but did not call a tool. StockFinder needs a model with tool (function) calling.`
      }
    }
    return { success: true, message: describeConnectionSuccess(model) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}
```

`describeConnectionSuccess` reports anything that was learned, so the user knows what jobs will use. For example: "Connection successful. This model allows at most 16,384 output tokens, so StockFinder will use that." It needs a small read-only accessor next to `sendWithLearnedQuirks`:

```ts
export function learnedQuirksFor(quirkKey: string): Readonly<ModelRequestQuirks> | undefined {
  return modelRequestQuirks.get(quirkKey)
}
```

Each provider class already knows its URL, so pass `url` in `options` and build the key the same way `sendWithLearnedQuirks` does (`${url}::${model}` for OpenAI-compatible providers, the URL for Gemini).

Also fix the fallback model mismatch: pass `DEFAULT_MODEL_IDS.openai` as `defaultModel` in `OpenAiProvider.testConnection` instead of `'gpt-4o-mini'`.

**Tests** (in `test/model-request-quirks.test.ts`, with a fake `fetch`):

- A response with a `tool_calls` entry for `report_ready` gives `success: true`.
- A text-only response gives `success: false` with the tool-calling message.
- A 400 with the token-cap message, then a tool call, gives `success: true`, and the message mentions 16,384.

**Manual check:** Test connection with `gpt-4o`. It passes and mentions the 16,384 cap. Then try a model without tool support (any base or instruct model on OpenRouter that lacks function calling). It fails with the new message.

### Phase 2: Complete token usage (S)

1. Extend the usage type in `LlmToolTurnResult` (line 68) with `cachedInputTokens?: number`.
2. OpenAI-compatible adapter (line 340): read `data.usage.prompt_tokens_details?.cached_tokens` into `cachedInputTokens`, and add the field to the response type at line 300. Check what OpenRouter returns for the models you use. It forwards provider cache statistics for many of them, but not all.
3. Gemini adapter (line 727):
   - `cachedInputTokens: data.usageMetadata.cachedContentTokenCount`
   - `reasoningTokens: data.usageMetadata.thoughtsTokenCount`
   - `outputTokens: (candidatesTokenCount ?? 0) + (thoughtsTokenCount ?? 0)`, because thinking is billed as output.

   Add those fields to the `usageMetadata` type.

4. `AgentRunner`: add `cachedInputTokens` to `this.usage`, sum it in the three places that add usage (beat split around line 896, the agent turn, and idea expansion), and include it in the per-turn log line. Plan 01's `parseTokenUsage` should accept and keep the optional field.
5. The Run screen display is plan 06 phase 6. Show cached tokens there as "(8.0K cached)" when they're non-zero.

**Tests:** extend the adapter unit tests with recorded usage blocks from each provider.

**Why it matters:** plan 05 changes compaction partly to keep the prompt cache warm. Without `cachedInputTokens`, nobody can tell whether that worked.

### Phase 3: Budget Gemini thinking on structured calls (S)

1. In the Gemini adapter, when `input.reasoning` asks for low or disabled reasoning (as `LLM_STRUCTURED_REASONING` does), add `generationConfig.thinkingConfig = { thinkingBudget: 0 }`. For agent turns (`LLM_AGENT_REASONING`), use a small fixed budget such as 1,024.
2. Some models reject this. Gemini 2.5 Pro can't turn thinking off, and newer families may use `thinkingLevel` instead of `thinkingBudget`. Extend `learnModelRequestQuirk` so that a 400 mentioning `thinking` produces either:
   - `{ minThinkingBudget: n }`, when the message states a minimum (resend with that), or
   - `{ omitThinkingConfig: true }`, otherwise (resend without `thinkingConfig`).
3. Record the exact wording from the first live rejection you see in `test/model-request-quirks.test.ts`, the same way plan 01 did for the token cap.

**Tests:** unit-test the payload builder. Low reasoning gives `thinkingBudget: 0`. With `omitThinkingConfig` learned, the field is absent.

**Manual check:** run a beat split on a Gemini 2.5 Flash model id and compare `reasoningTokens` in the log before and after. It should drop to zero or near zero.

### Phase 4: Make the timeout setting honest (S)

There are two options. Pick one.

- **A (recommended now):** keep the fixed LLM timeout and relabel the setting. In the Settings performance panel, rename "Request timeout" to "Pexels and download timeout" and add a line: "LLM requests can take up to 10 minutes on long scripts." This changes no behavior, but the UI stops implying something false.
- **B:** do phase 5. The setting then becomes the LLM idle timeout too.

### Phase 5 (optional): Streaming with an idle timeout (M)

Do this only if live jobs still hit timeouts after plan 08, whose calls are much shorter than today's.

**Idea.** Stream responses and abort when no data arrives for a while, instead of waiting for a fixed wall-clock limit. A stall in the middle of a response is then detected in seconds rather than at 10 minutes.

**One caveat shapes the design.** Reasoning models send nothing while they think. OpenAI Chat Completions sends no keep-alive chunks during reasoning, and Gemini sends its first chunk after thinking ends. A short idle timeout from the moment of the request would kill legitimate requests. So use two limits:

- **Time to first data:** long. Keep 600 seconds, or make it its own setting.
- **Idle after first data:** the user's timeout setting (default 60 seconds). Reset it on every received chunk, including SSE comment lines. OpenRouter sends `: OPENROUTER PROCESSING` comments while it waits, which keeps the request alive.

**Steps.**

1. Add `src/main/services/llm/sse.ts`, a server-sent-events reader:

   ```ts
   /** Yields the data payload of each SSE event. Comment lines count as activity but yield nothing. */
   export async function* readSseData(
     body: ReadableStream<Uint8Array>,
     onActivity: () => void
   ): AsyncGenerator<string> {
     const decoder = new TextDecoder()
     let buffer = ''
     for await (const chunk of body) {
       onActivity()
       buffer += decoder.decode(chunk, { stream: true })
       let boundary: number
       while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
         const event = buffer.slice(0, boundary)
         buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
         const data = event
           .split(/\r?\n/)
           .filter((line) => line.startsWith('data:'))
           .map((line) => line.slice(5).trimStart())
           .join('\n')
         if (data) yield data
       }
     }
   }
   ```

2. Add `src/main/services/llm/stream-accumulators.ts` with two pure functions:
   - `accumulateOpenAiChunks(chunks)`: concatenates `delta.content`; builds tool calls by `delta.tool_calls[].index` (`id` and `function.name` arrive once, `function.arguments` arrives in pieces); keeps the last `finish_reason`; reads `usage` from the final chunk (sent when `stream_options: { include_usage: true }` is set); stops at `[DONE]`.
   - `accumulateGeminiChunks(chunks)`: concatenates text parts, skipping `thought: true`; collects `functionCall` parts, which Gemini sends whole rather than in pieces; keeps the last `finishReason` and `usageMetadata`.
3. In `createOpenAiCompatibleToolTurn`, set `stream: true` and `stream_options: { include_usage: true }`. For Gemini, call `:streamGenerateContent?alt=sse` instead of `:generateContent`. Return the same `LlmToolTurnResult` shape, so no caller changes.
4. Timeouts: replace the single `createTimeoutLinkedSignal(timeoutSeconds * 1000, …)` around LLM calls with a small `createStreamTimeouts({ firstDataMs, idleMs, signal })` helper. It aborts its controller when either limit passes, and `onActivity` resets the idle timer.
5. Retries: `fetchWithRetry` only covers the request up to the response headers. Wrap the request and the stream read in one retry loop, so a stream that fails midway (idle abort, connection reset) is resent once. A model call has no side effects except cost, so this is safe.
6. Fallback: if a provider rejects streaming with a 400 that mentions `stream`, learn `{ noStreaming: true }` and use the current non-streaming path for that model.
7. Change `resolveLlmRequestTimeoutSeconds` to return the user's setting as the idle timeout. Keep `MIN_LLM_REQUEST_TIMEOUT_SECONDS` only as the time-to-first-data default. Update the comment in `llm-timeout.ts` and the Settings label.

**Tests:**

- SSE reader: chunk boundaries in the middle of a line, in the middle of a multi-byte UTF-8 character, and between `\r\n` pairs; comment lines; multi-line `data:`.
- OpenAI accumulator: two tool calls with interleaved argument fragments by `index`; usage in the final chunk; content-only response; `finish_reason: 'length'`.
- Gemini accumulator: a function call in one chunk, text in several, thought parts skipped.
- Timeouts, with `mock.timers` from `node:test`: no first data within the limit aborts; data then silence aborts after the idle time; steady data never aborts.
- Mid-stream failure is retried once, then surfaced.

## Risks and mitigations

| Risk                                                     | Mitigation                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The connection test now costs a real tool call           | The output is a few tokens. The 32,768 cap is a ceiling, not a charge.                                               |
| A provider's thinking-config error wording isn't matched | The 400 surfaces unchanged and the job stops with the provider's message. Add the wording to the test and the regex. |
| Streaming changes behavior across three adapters at once | It's optional, comes last, has the `noStreaming` fallback, and keeps the same result type.                           |

## Open questions

- Should the learned quirks be saved to `settings.json`, so the first job after each app start doesn't pay one rejected request? Probably not: the cost is one fast 400 per model per session, and stale entries would need invalidating.
