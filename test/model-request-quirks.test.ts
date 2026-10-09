import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  LlmProviderFactory,
  type AgentMessage,
  type LlmReasoningConfig,
  type LlmToolTurnResult,
  LLM_AGENT_REASONING,
  LLM_AGENT_THINKING_BUDGET,
  LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
  LLM_STRUCTURED_REASONING,
  learnModelRequestQuirk,
  resetModelRequestQuirks,
  statedMinimum
} from '../src/main/services/llm/llm-provider.ts'
import { resetLlmCircuit } from '../src/main/services/llm/llm-fetch.ts'

const originalFetch = globalThis.fetch

const TOKEN_CAP_ERROR =
  'max_tokens is too large: 32768. This model supports at most 16384 completion tokens, whereas you provided 32768.'
const TEMPERATURE_ERROR =
  "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported."

const okResponse = (): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }] })
  }) as Response

const badRequest = (message: string): Response =>
  ({
    ok: false,
    status: 400,
    headers: new Headers(),
    text: async () => JSON.stringify({ error: { message } })
  }) as Response

describe('model request quirks (limits learned from provider 400s)', () => {
  const provider = LlmProviderFactory.getProvider('openai')

  const turn = (model: string): Promise<unknown> =>
    provider.createToolTurn(
      {
        model,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'ping' }],
        tools: [],
        toolChoice: 'none',
        temperature: 0.2,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
      },
      { apiKey: 'sk-test' }
    )

  beforeEach(() => {
    resetLlmCircuit()
    resetModelRequestQuirks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('parses the adjustment out of provider error messages', () => {
    assert.deepEqual(learnModelRequestQuirk(TOKEN_CAP_ERROR, 32768), { maxOutputTokens: 16384 })
    assert.deepEqual(learnModelRequestQuirk(TEMPERATURE_ERROR, 32768), { omitTemperature: true })
    assert.equal(learnModelRequestQuirk('Invalid API key provided.', 32768), null)
    // A cap we already respect teaches nothing new, so the caller stops retrying.
    assert.equal(learnModelRequestQuirk(TOKEN_CAP_ERROR, 16384), null)
  })

  it('retries with the stated cap and starts later turns from it', async () => {
    const sent: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as Record<string, unknown>
      sent.push(payload)
      return (payload.max_completion_tokens as number) > 16384
        ? badRequest(TOKEN_CAP_ERROR)
        : okResponse()
    }) as typeof globalThis.fetch

    await turn('gpt-4o')
    assert.deepEqual(
      sent.map((p) => p.max_completion_tokens),
      [32768, 16384]
    )

    await turn('gpt-4o')
    assert.equal(sent.length, 3, 'the learned cap is reused without another rejected request')
    assert.equal(sent[2].max_completion_tokens, 16384)
  })

  it('drops temperature for models that only accept the default', async () => {
    const sent: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as Record<string, unknown>
      sent.push(payload)
      return 'temperature' in payload ? badRequest(TEMPERATURE_ERROR) : okResponse()
    }) as typeof globalThis.fetch

    await turn('reasoning-model')
    assert.equal(sent.length, 2)
    assert.equal(sent[0].temperature, 0.2)
    assert.equal('temperature' in sent[1], false)
  })

  it('teaches the Gemini adapter its output cap the same way', async () => {
    const GEMINI_CAP_ERROR =
      'Unable to submit request because it has a maxOutputTokens value of 32768 but the supported range is from 1 (inclusive) to 8193 (exclusive). Update the value and try again.'
    const sent: number[] = []
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as {
        generationConfig: { maxOutputTokens: number }
      }
      sent.push(payload.generationConfig.maxOutputTokens)
      return payload.generationConfig.maxOutputTokens > 8192
        ? badRequest(GEMINI_CAP_ERROR)
        : ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ candidates: [{ content: { parts: [{ text: 'pong' }] } }] })
          } as Response)
    }) as typeof globalThis.fetch

    const gemini = LlmProviderFactory.getProvider('gemini')
    const geminiTurn = (): Promise<unknown> =>
      gemini.createToolTurn(
        {
          model: 'gemini-small-output',
          systemPrompt: '',
          messages: [{ role: 'user', content: 'ping' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.2,
          maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
        },
        { apiKey: 'test-key' }
      )

    await geminiTurn()
    assert.deepEqual(sent, [32768, 8192], 'the exclusive bound is read from the message')

    await geminiTurn()
    assert.deepEqual(sent.slice(2), [8192], 'the learned cap is reused without a retry')
  })

  const TOOLS_NEED_RESPONSES_ERROR =
    "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."

  const PING_TOOL = {
    name: 'report_ready',
    description: 'Confirm.',
    parameters: { type: 'object' as const, properties: { ok: { type: 'boolean' } } }
  }

  it('moves tool calling to the Responses API when Chat Completions refuses it', async () => {
    assert.deepEqual(learnModelRequestQuirk(TOOLS_NEED_RESPONSES_ERROR, 32768), {
      useResponsesApi: true
    })

    const sent: Array<{ url: string; payload: Record<string, unknown> }> = []
    const reasoningItem = { type: 'reasoning', id: 'rs_1', encrypted_content: 'abc' }
    const callItem = {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'report_ready',
      arguments: '{"ok":true}'
    }
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as Record<string, unknown>
      sent.push({ url, payload })
      if (url.endsWith('/chat/completions')) return badRequest(TOOLS_NEED_RESPONSES_ERROR)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          status: 'completed',
          output: [reasoningItem, callItem],
          usage: {
            input_tokens: 50,
            output_tokens: 30,
            total_tokens: 80,
            output_tokens_details: { reasoning_tokens: 20 },
            input_tokens_details: { cached_tokens: 40 }
          }
        })
      } as Response
    }) as typeof globalThis.fetch

    const toolTurn = (messages: AgentMessage[]): Promise<LlmToolTurnResult> =>
      provider.createToolTurn(
        {
          model: 'gpt-6-astra',
          systemPrompt: 'Be brief.',
          messages,
          tools: [PING_TOOL],
          toolChoice: { name: 'report_ready' },
          temperature: 0.2,
          maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
        },
        { apiKey: 'sk-test' }
      )

    const first = await toolTurn([{ role: 'user', content: 'ping' }])
    assert.deepEqual(
      sent.map((s) => new URL(s.url).pathname),
      ['/v1/chat/completions', '/v1/responses']
    )
    const request = sent[1].payload
    assert.equal(request.instructions, 'Be brief.')
    assert.equal(request.max_output_tokens, 32768)
    assert.equal(request.store, false)
    assert.equal('temperature' in request, false)
    assert.deepEqual(request.tool_choice, { type: 'function', name: 'report_ready' })
    assert.deepEqual((request.tools as Array<Record<string, unknown>>)[0], {
      type: 'function',
      ...PING_TOOL,
      strict: false
    })

    assert.equal(first.stopReason, 'tool_calls')
    assert.deepEqual(first.toolCalls, [
      { id: 'call_1', name: 'report_ready', arguments: '{"ok":true}' }
    ])
    assert.equal(first.usage?.reasoningTokens, 20)
    assert.equal(first.usage?.cachedInputTokens, 40)

    // The next turn goes straight to Responses and replays the reasoning item with the call.
    await toolTurn([
      { role: 'user', content: 'ping' },
      first.assistantMessage,
      { role: 'tool', tool_call_id: 'call_1', name: 'report_ready', content: '{"done":true}' }
    ])
    assert.equal(sent.length, 3)
    assert.deepEqual(sent[2].payload.input, [
      { role: 'user', content: 'ping' },
      reasoningItem,
      callItem,
      { type: 'function_call_output', call_id: 'call_1', output: '{"done":true}' }
    ])
  })

  it('never sends a temperature to Gemini', async () => {
    let generationConfig: Record<string, unknown> = {}
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        generationConfig: Record<string, unknown>
      }
      generationConfig = body.generationConfig
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'pong' }] } }] })
      } as Response
    }) as typeof globalThis.fetch

    await LlmProviderFactory.getProvider('gemini').createToolTurn(
      {
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'ping' }],
        tools: [],
        toolChoice: 'none',
        temperature: 0.2,
        maxOutputTokens: 1000
      },
      { apiKey: 'test-key' }
    )
    assert.deepEqual(generationConfig, { maxOutputTokens: 1000 })
  })

  describe('connection test', () => {
    const readyCall = (): Response =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'report_ready', arguments: '{"ok":true}' }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ]
        })
      }) as Response

    it('sends a forced tool call with beat-split parameters', async () => {
      let payload: Record<string, unknown> = {}
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        payload = JSON.parse(init?.body as string) as Record<string, unknown>
        return readyCall()
      }) as typeof globalThis.fetch

      const result = await provider.testConnection({ apiKey: 'sk-test' }, '')
      assert.deepEqual(result, { success: true, message: 'Connection successful!' })
      assert.equal(
        payload.model,
        'gpt-4o',
        'an empty model field tests the model jobs fall back to'
      )
      assert.equal(payload.temperature, 0.2)
      assert.equal(payload.max_completion_tokens, LLM_STRUCTURED_MAX_OUTPUT_TOKENS)
      assert.deepEqual(payload.tool_choice, {
        type: 'function',
        function: { name: 'report_ready' }
      })
    })

    it('fails for a model that answers without calling the tool', async () => {
      globalThis.fetch = (async () => okResponse()) as typeof globalThis.fetch

      const result = await provider.testConnection({ apiKey: 'sk-test' }, 'text-only-model')
      assert.equal(result.success, false)
      assert.match(result.message, /text-only-model answered but did not call a tool/)
    })

    it('reports the output cap it learned', async () => {
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(init?.body as string) as Record<string, unknown>
        return (payload.max_completion_tokens as number) > 16384
          ? badRequest(TOKEN_CAP_ERROR)
          : readyCall()
      }) as typeof globalThis.fetch

      const result = await provider.testConnection({ apiKey: 'sk-test' }, 'gpt-4o')
      assert.equal(result.success, true)
      assert.match(result.message, /at most 16,384 output tokens/)
    })
  })

  describe('Gemini thinking and usage', () => {
    const gemini = LlmProviderFactory.getProvider('gemini')
    const THINKING_ERROR = 'Thinking level is not supported for this model.'
    const MIN_BUDGET_ERROR =
      'The thinking budget 0 is invalid. Please choose a value between 128 and 32768.'

    const geminiTurn = (
      model: string,
      reasoning: LlmReasoningConfig = LLM_STRUCTURED_REASONING
    ): Promise<LlmToolTurnResult> =>
      gemini.createToolTurn(
        {
          model,
          systemPrompt: '',
          messages: [{ role: 'user', content: 'ping' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.2,
          maxOutputTokens: 1000,
          reasoning
        },
        { apiKey: 'test-key' }
      )

    /** Records each request's generationConfig; `answer` decides what the fake model says. */
    const fakeGemini = (
      answer: (config: Record<string, unknown>) => Response
    ): Array<Record<string, unknown>> => {
      const sent: Array<Record<string, unknown>> = []
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as {
          generationConfig: Record<string, unknown>
        }
        sent.push(body.generationConfig)
        return answer(body.generationConfig)
      }) as typeof globalThis.fetch
      return sent
    }

    const thinkingOf = (config: Record<string, unknown>): Record<string, number | string> | null =>
      (config.thinkingConfig as Record<string, number | string> | undefined) ?? null

    const geminiOk = (usageMetadata?: Record<string, number>): Response =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'pong' }] } }],
          usageMetadata
        })
      }) as Response

    it('reads the minimum a provider states', () => {
      assert.equal(statedMinimum(MIN_BUDGET_ERROR), 128)
      assert.equal(statedMinimum('The supported range is from 1,024 (inclusive) to 32768.'), 1024)
      assert.equal(statedMinimum('thinking_budget must be at least 512'), 512)
      assert.equal(statedMinimum('Thinking requires a minimum of 256 tokens.'), 256)
      assert.equal(statedMinimum(THINKING_ERROR), null)
    })

    it('walks the thinking ladder one rung per rejection', () => {
      assert.deepEqual(learnModelRequestQuirk(THINKING_ERROR, 1000, {}, { thinkingLevel: 'low' }), {
        useThinkingBudget: true
      })
      const budget0 = { thinkingBudget: 0 }
      assert.deepEqual(
        learnModelRequestQuirk(MIN_BUDGET_ERROR, 1000, { useThinkingBudget: true }, budget0),
        { minThinkingBudget: 128 }
      )
      // No minimum stated, or one the request already met: nothing is left but none.
      assert.deepEqual(
        learnModelRequestQuirk(THINKING_ERROR, 1000, { useThinkingBudget: true }, budget0),
        { omitThinkingConfig: true }
      )
      assert.deepEqual(
        learnModelRequestQuirk(
          MIN_BUDGET_ERROR,
          1000,
          { useThinkingBudget: true, minThinkingBudget: 128 },
          { thinkingBudget: 128 }
        ),
        { omitThinkingConfig: true }
      )
      // Nothing was sent, so a mention of thinking is not about us.
      assert.equal(learnModelRequestQuirk(THINKING_ERROR, 1000), null)
    })

    it('falls back from thinkingLevel to a zero budget on structured calls', async () => {
      const sent = fakeGemini((config) =>
        thinkingOf(config)?.thinkingLevel ? badRequest(THINKING_ERROR) : geminiOk()
      )

      await geminiTurn('gemini-2.5-flash')
      assert.deepEqual(sent, [
        { maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: 'low' } },
        { maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 0 } }
      ])

      await geminiTurn('gemini-2.5-flash')
      assert.equal(sent.length, 3, 'the next turn is not rejected first')
      assert.deepEqual(thinkingOf(sent[2]), { thinkingBudget: 0 })
    })

    it('falls back to the agent budget on agent turns', async () => {
      const sent = fakeGemini((config) =>
        thinkingOf(config)?.thinkingLevel ? badRequest(THINKING_ERROR) : geminiOk()
      )

      await geminiTurn('gemini-2.5-flash', LLM_AGENT_REASONING)
      assert.equal(LLM_AGENT_THINKING_BUDGET, 1024)
      assert.deepEqual(sent.map(thinkingOf), [
        { thinkingLevel: 'low' },
        { thinkingBudget: LLM_AGENT_THINKING_BUDGET }
      ])

      await geminiTurn('gemini-2.5-flash', LLM_AGENT_REASONING)
      assert.equal(sent.length, 3)
      assert.deepEqual(thinkingOf(sent[2]), { thinkingBudget: LLM_AGENT_THINKING_BUDGET })
    })

    it('raises the budget to the minimum the model states', async () => {
      const sent = fakeGemini((config) => {
        const thinking = thinkingOf(config)
        if (thinking?.thinkingLevel) return badRequest(THINKING_ERROR)
        return typeof thinking?.thinkingBudget === 'number' && thinking.thinkingBudget < 128
          ? badRequest(MIN_BUDGET_ERROR)
          : geminiOk()
      })

      await geminiTurn('gemini-2.5-pro')
      assert.deepEqual(sent.map(thinkingOf), [
        { thinkingLevel: 'low' },
        { thinkingBudget: 0 },
        { thinkingBudget: 128 }
      ])

      await geminiTurn('gemini-2.5-pro')
      assert.equal(sent.length, 4)
      assert.deepEqual(thinkingOf(sent[3]), { thinkingBudget: 128 })
    })

    it('drops thinkingConfig once level and budget are both rejected', async () => {
      const sent = fakeGemini((config) =>
        'thinkingConfig' in config ? badRequest(THINKING_ERROR) : geminiOk()
      )

      await geminiTurn('no-thinking-model')
      assert.deepEqual(sent.map(thinkingOf), [
        { thinkingLevel: 'low' },
        { thinkingBudget: 0 },
        null
      ])

      await geminiTurn('no-thinking-model')
      assert.equal(sent.length, 4)
      assert.deepEqual(sent[3], { maxOutputTokens: 1000 }, 'later turns start without it')
    })

    it('does not resend a thinking complaint when no thinkingConfig was sent', async () => {
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        return badRequest('Thinking mode is unavailable for this account.')
      }) as typeof globalThis.fetch

      // Gemini without low-effort reasoning, and OpenAI, which never sends one.
      await assert.rejects(
        () => geminiTurn('gemini-3.8-flash', { effort: 'high' }),
        /Thinking mode/
      )
      assert.equal(calls, 1)
      await assert.rejects(() => turn('gpt-4o'), /Thinking mode/)
      assert.equal(calls, 2)
    })

    it('counts thinking as output and reports cached input', async () => {
      globalThis.fetch = (async () =>
        geminiOk({
          promptTokenCount: 9000,
          candidatesTokenCount: 120,
          thoughtsTokenCount: 300,
          totalTokenCount: 9420,
          cachedContentTokenCount: 8000
        })) as typeof globalThis.fetch

      const result = await geminiTurn('gemini-3.8-flash')
      assert.deepEqual(result.usage, {
        inputTokens: 9000,
        outputTokens: 420,
        totalTokens: 9420,
        reasoningTokens: 300,
        cachedInputTokens: 8000
      })
    })
  })

  describe('a model that rejects images', () => {
    const IMAGE_ERROR = 'Invalid content type. image_url is only supported by certain models.'
    const GEMINI_IMAGE_ERROR = 'Image input modality is not enabled for models/gemma-text-only.'
    const THUMB =
      'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'

    const imageTurn = (model: string, withImages = true): Promise<LlmToolTurnResult> =>
      provider.createToolTurn(
        {
          model,
          systemPrompt: '',
          messages: [
            {
              role: 'user',
              content: 'Rank these.',
              ...(withImages ? { images: [{ url: THUMB }] } : {})
            }
          ],
          tools: [],
          toolChoice: 'none',
          temperature: 0.2,
          maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
        },
        { apiKey: 'sk-test' }
      )

    /** The content of the user message of each chat request, in the order sent. */
    const userContents = (sent: Array<Record<string, unknown>>): unknown[] =>
      sent.map(
        (payload) =>
          (payload.messages as Array<{ role: string; content: unknown }>).find(
            (m) => m.role === 'user'
          )?.content
      )

    it('learns it from a message about images, and only when the request carried images', () => {
      for (const message of [
        IMAGE_ERROR,
        'This model does not support image input.',
        'Vision is not available for this model.',
        'The model is not multimodal.',
        'Unknown field inlineData in contents[0].parts[1]'
      ]) {
        assert.deepEqual(learnModelRequestQuirk(message, 32768, {}, undefined, true), {
          omitImages: true
        })
        assert.equal(learnModelRequestQuirk(message, 32768), null, message)
      }
      assert.equal(
        learnModelRequestQuirk('Invalid API key provided.', 32768, {}, undefined, true),
        null
      )
      // A cap in the message is still read as a cap.
      assert.deepEqual(learnModelRequestQuirk(TOKEN_CAP_ERROR, 32768, {}, undefined, true), {
        maxOutputTokens: 16384
      })
    })

    it('resends without the images, and starts later turns without them', async () => {
      const sent: Array<Record<string, unknown>> = []
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(init?.body as string) as Record<string, unknown>
        sent.push(payload)
        return JSON.stringify(payload).includes('image_url')
          ? badRequest(IMAGE_ERROR)
          : okResponse()
      }) as typeof globalThis.fetch

      const first = await imageTurn('gpt-text-only')
      assert.deepEqual(userContents(sent), [
        [
          { type: 'text', text: 'Rank these.' },
          { type: 'image_url', image_url: { url: THUMB, detail: 'low' } }
        ],
        'Rank these.'
      ])
      assert.equal(first.imagesOmitted, true, 'the result says the images were left out')

      const second = await imageTurn('gpt-text-only')
      assert.equal(sent.length, 3, 'the learned quirk is reused without another rejected request')
      assert.equal(userContents(sent)[2], 'Rank these.')
      assert.equal(second.imagesOmitted, true)

      const plain = await imageTurn('gpt-text-only', false)
      assert.equal(plain.imagesOmitted, undefined, 'a request with no images was not changed')
    })

    it('learns nothing from the same message when the request had no images', async () => {
      const sent: Array<Record<string, unknown>> = []
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        sent.push(JSON.parse(init?.body as string) as Record<string, unknown>)
        return sent.length === 1 ? badRequest(IMAGE_ERROR) : okResponse()
      }) as typeof globalThis.fetch

      await assert.rejects(() => imageTurn('gpt-4o', false), /image_url is only supported/)
      assert.equal(sent.length, 1, 'no resend')

      const next = await imageTurn('gpt-4o')
      assert.equal(sent.length, 2)
      assert.ok(Array.isArray(userContents(sent)[1]), 'the next request still carries its images')
      assert.equal(next.imagesOmitted, undefined)
    })

    it('keeps the quirk to the model that was rejected', async () => {
      const sent: Array<Record<string, unknown>> = []
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(init?.body as string) as Record<string, unknown>
        sent.push(payload)
        return payload.model === 'gpt-text-only' && JSON.stringify(payload).includes('image_url')
          ? badRequest(IMAGE_ERROR)
          : okResponse()
      }) as typeof globalThis.fetch

      await imageTurn('gpt-text-only')
      await imageTurn('gpt-4o')

      assert.ok(Array.isArray(userContents(sent)[2]), 'another model still gets its images')
    })

    it('does not resend a message about something else', async () => {
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        return badRequest('Invalid API key provided.')
      }) as typeof globalThis.fetch

      await assert.rejects(() => imageTurn('gpt-4o'), /Invalid API key/)
      assert.equal(calls, 1)
    })

    it('resends a Responses API request without its images', async () => {
      const sent: Array<{ url: string; payload: Record<string, unknown> }> = []
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        const payload = JSON.parse(init?.body as string) as Record<string, unknown>
        sent.push({ url, payload })
        if (url.endsWith('/chat/completions')) return badRequest(TOOLS_NEED_RESPONSES_ERROR)
        return JSON.stringify(payload).includes('input_image')
          ? badRequest('Image inputs are not supported by this model.')
          : ({
              ok: true,
              status: 200,
              headers: new Headers(),
              json: async () => ({
                status: 'completed',
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]
              })
            } as Response)
      }) as typeof globalThis.fetch

      const result = await imageTurn('gpt-6-astra')

      const inputs = sent.filter((s) => s.url.endsWith('/v1/responses')).map((s) => s.payload.input)
      assert.deepEqual(inputs, [
        [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Rank these.' },
              { type: 'input_image', image_url: THUMB, detail: 'low' }
            ]
          }
        ],
        [{ role: 'user', content: 'Rank these.' }]
      ])
      assert.equal(result.imagesOmitted, true)
    })

    it('resends a Gemini request without its images, and stops fetching them', async () => {
      const generated: Array<{ contents: Array<{ parts: unknown[] }> }> = []
      const fetchedImages: string[] = []
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        if (url.startsWith('https://images.pexels.com/')) {
          fetchedImages.push(url)
          return new Response(Uint8Array.from([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
          })
        }
        const body = JSON.parse(init?.body as string) as { contents: Array<{ parts: unknown[] }> }
        generated.push(body)
        return JSON.stringify(body).includes('inlineData')
          ? badRequest(GEMINI_IMAGE_ERROR)
          : ({
              ok: true,
              status: 200,
              headers: new Headers(),
              json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
            } as Response)
      }) as typeof globalThis.fetch

      const gemini = LlmProviderFactory.getProvider('gemini')
      const geminiTurn = (): Promise<LlmToolTurnResult> =>
        gemini.createToolTurn(
          {
            model: 'gemma-text-only',
            systemPrompt: '',
            messages: [{ role: 'user', content: 'Rank these.', images: [{ url: THUMB }] }],
            tools: [],
            toolChoice: 'none',
            temperature: 0.2,
            maxOutputTokens: 1000
          },
          { apiKey: 'test-key' }
        )

      const first = await geminiTurn()
      assert.deepEqual(
        generated.map((g) => g.contents[0].parts.length),
        [3, 1],
        'text, label and image; then the text alone'
      )
      assert.equal(first.imagesOmitted, true)
      assert.equal(fetchedImages.length, 1, 'the image was fetched once, for the first attempt')

      await geminiTurn()
      assert.equal(generated.length, 3)
      assert.equal(generated[2].contents[0].parts.length, 1)
      assert.equal(fetchedImages.length, 1, 'the next turn did not fetch it again')
    })
  })

  it('reads cached input tokens from Chat Completions usage', async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 9000,
            completion_tokens: 20,
            total_tokens: 9020,
            prompt_tokens_details: { cached_tokens: 8000 }
          }
        })
      }) as Response) as typeof globalThis.fetch

    const result = (await turn('gpt-4o')) as LlmToolTurnResult
    assert.equal(result.usage?.cachedInputTokens, 8000)
  })

  it('does not retry unrelated 400s', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return badRequest('The model `nope` does not exist.')
    }) as typeof globalThis.fetch

    await assert.rejects(() => turn('nope'), /does not exist/)
    assert.equal(calls, 1)
  })
})
