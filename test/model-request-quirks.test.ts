import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  LlmProviderFactory,
  type AgentMessage,
  type LlmToolTurnResult,
  LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
  learnModelRequestQuirk,
  resetModelRequestQuirks
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
            output_tokens_details: { reasoning_tokens: 20 }
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
