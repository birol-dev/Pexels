import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LlmProviderFactory } from '../src/main/services/llm/llm-provider.ts'
import type { NormalizedToolDefinition } from '../src/main/services/llm/llm-provider.ts'
import { resetLlmCircuit } from '../src/main/services/llm/llm-fetch.ts'

const originalFetch = globalThis.fetch

beforeEach(() => {
  resetLlmCircuit()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  resetLlmCircuit()
})

const sampleTools: NormalizedToolDefinition[] = [
  {
    name: 'search_pexels_photos',
    description: 'Search for photos',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  }
]

describe('LlmProviderFactory', () => {
  it('returns valid providers for openai, openrouter, and gemini', () => {
    assert.equal(LlmProviderFactory.getProvider('openai').id, 'openai')
    assert.equal(LlmProviderFactory.getProvider('openrouter').id, 'openrouter')
    assert.equal(LlmProviderFactory.getProvider('gemini').id, 'gemini')
  })

  it('throws for unknown provider', () => {
    assert.throws(
      () => LlmProviderFactory.getProvider('unknown' as 'openai'),
      /Unknown LLM provider ID/
    )
  })
})

describe('OpenAiProvider', () => {
  const provider = LlmProviderFactory.getProvider('openai')

  it('rejects testConnection when API key is missing', async () => {
    const result = await provider.testConnection({ apiKey: '' }, 'gpt-4o')
    assert.equal(result.success, false)
    assert.ok(result.message.includes('missing'))
  })

  it('sends correct format and parses tool calls in createToolTurn', async () => {
    let capturedPayload: Record<string, unknown> | null = null
    let capturedHeaders: HeadersInit | undefined = undefined

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: {
                content: 'I will search for photos',
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'search_pexels_photos',
                      arguments: '{"query":"mountains"}'
                    }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 15,
            total_tokens: 40
          }
        })
      } as Response
    }) as typeof globalThis.fetch

    const result = await provider.createToolTurn(
      {
        model: ' gpt-4o ',
        systemPrompt: 'You are an assistant',
        messages: [{ role: 'user', content: 'Find mountain pictures' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 1000
      },
      { apiKey: ' sk-test-key ' }
    )

    const headersRecord = capturedHeaders as Record<string, string>
    assert.equal(headersRecord?.Authorization, 'Bearer sk-test-key')
    assert.equal(capturedPayload?.model, 'gpt-4o')
    const messages = capturedPayload?.messages as Array<{ role: string }>
    assert.equal(messages?.[0]?.role, 'system')
    assert.equal(messages?.[1]?.role, 'user')
    const tools = capturedPayload?.tools as Array<{ function: { name: string } }>
    assert.equal(tools?.[0]?.function?.name, 'search_pexels_photos')

    assert.equal(result.stopReason, 'tool_calls')
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].name, 'search_pexels_photos')
    assert.equal(result.toolCalls[0].arguments, '{"query":"mountains"}')
    assert.equal(result.usage?.totalTokens, 40)
  })
})

describe('OpenRouterProvider', () => {
  const provider = LlmProviderFactory.getProvider('openrouter')

  it('rejects testConnection when API key is missing', async () => {
    const result = await provider.testConnection({ apiKey: '  ' }, 'google/gemini-2.5-flash')
    assert.equal(result.success, false)
    assert.ok(result.message.includes('missing'))
  })

  it('sends HTTP-Referer and X-Title headers and extracts choices', async () => {
    let capturedHeaders: HeadersInit | undefined = undefined

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: {
                content: 'pong',
                tool_calls: undefined
              },
              finish_reason: 'stop'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    const testRes = await provider.testConnection(
      { apiKey: 'sk-or-v1-test' },
      'anthropic/claude-3-opus'
    )
    assert.equal(testRes.success, true)
    const headersRecord = capturedHeaders as Record<string, string>
    assert.equal(headersRecord?.['HTTP-Referer'], 'https://github.com/birol-dev/Pexels')
    assert.equal(headersRecord?.['X-Title'], 'AI Stock Asset Finder')
    assert.equal(headersRecord?.Authorization, 'Bearer sk-or-v1-test')
  })
})

describe('GeminiProvider', () => {
  const provider = LlmProviderFactory.getProvider('gemini')

  it('rejects testConnection when API key is missing', async () => {
    const result = await provider.testConnection({ apiKey: '' }, 'gemini-2.5-flash')
    assert.equal(result.success, false)
    assert.ok(result.message.includes('missing'))
  })

  it('formats schema types to uppercase, strips additionalProperties, and parses response', async () => {
    let capturedPayload: Record<string, unknown> | null = null
    let capturedUrl = ''
    let capturedHeaders: HeadersInit | undefined

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedHeaders = init?.headers
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Searching Pexels for nature' },
                  {
                    functionCall: {
                      name: 'search_pexels_photos',
                      args: { query: 'forest' }
                    }
                  }
                ]
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
            totalTokenCount: 70
          }
        })
      } as Response
    }) as typeof globalThis.fetch

    const toolsWithExtras: NormalizedToolDefinition[] = [
      {
        name: 'search_pexels_photos',
        description: 'Search for photos',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }
    ]

    const result = await provider.createToolTurn(
      {
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are StockScout',
        messages: [{ role: 'user', content: 'Find a forest photo' }],
        tools: toolsWithExtras,
        toolChoice: 'auto',
        temperature: 0.3,
        maxOutputTokens: 1000
      },
      { apiKey: 'AIzaSyTestKey' }
    )

    assert.ok(capturedUrl.endsWith('models/gemini-2.5-flash:generateContent'))
    assert.ok(!capturedUrl.includes('key='))
    const headerMap = (capturedHeaders as Record<string, string>) || {}
    assert.equal(headerMap['x-goog-api-key'], 'AIzaSyTestKey')
    const sysInstruction = capturedPayload?.systemInstruction as { parts: Array<{ text: string }> }
    assert.equal(sysInstruction?.parts?.[0]?.text, 'You are StockScout')

    const tools = capturedPayload?.tools as Array<{
      functionDeclarations: Array<{
        parameters: {
          type: string
          properties: { query: { type: string } }
          additionalProperties?: unknown
        }
      }>
    }>
    const functionDecl = tools?.[0]?.functionDeclarations?.[0]
    assert.equal(functionDecl?.parameters?.type, 'OBJECT')
    assert.equal(functionDecl?.parameters?.properties?.query?.type, 'STRING')
    assert.equal(functionDecl?.parameters?.additionalProperties, undefined)

    assert.equal(result.assistantMessage.content, 'Searching Pexels for nature')
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].name, 'search_pexels_photos')
    assert.equal(result.toolCalls[0].arguments, '{"query":"forest"}')
    assert.equal(result.usage?.totalTokens, 70)
  })

  it('surfaces safety blocked response clearly', async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              finishReason: 'SAFETY'
            }
          ]
        })
      }) as Response) as typeof globalThis.fetch

    await assert.rejects(
      () =>
        provider.createToolTurn(
          {
            model: 'gemini-2.5-flash',
            systemPrompt: '',
            messages: [{ role: 'user', content: 'hello' }],
            tools: [],
            toolChoice: 'none',
            temperature: 0.1,
            maxOutputTokens: 10
          },
          { apiKey: 'AIzaSyTestKey' }
        ),
      /blocked due to safety settings/
    )
  })

  it('preserves thought_signature and rawParts in multi-turn history', async () => {
    let capturedPayload: Record<string, unknown> | null = null

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Here are the results' }]
              },
              finishReason: 'STOP'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    const rawPartsWithSignature = [
      { text: 'Thinking about query...', thought: true },
      {
        functionCall: {
          name: 'search_pexels_videos',
          args: { beatId: 'beat_1', query: 'futuristic server room' }
        },
        thought_signature: 'test_encrypted_signature_token_123'
      }
    ]

    await provider.createToolTurn(
      {
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are StockScout',
        messages: [
          { role: 'user', content: 'Find stock clips' },
          {
            role: 'assistant',
            content: 'Searching videos',
            tool_calls: [
              {
                id: 'call_1',
                name: 'search_pexels_videos',
                arguments: '{"beatId":"beat_1","query":"futuristic server room"}'
              }
            ],
            rawParts: rawPartsWithSignature
          },
          {
            role: 'tool',
            name: 'search_pexels_videos',
            tool_call_id: 'call_1',
            content: JSON.stringify({ results: [] })
          }
        ],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.3,
        maxOutputTokens: 1000
      },
      { apiKey: 'AIzaSyTestKey' }
    )

    const contents = capturedPayload?.contents as Array<{
      role: string
      parts: Array<Record<string, unknown>>
    }>
    assert.equal(contents.length, 3)
    assert.equal(contents[1].role, 'model')
    assert.equal(contents[1].parts.length, 2)
    assert.equal(contents[1].parts[1].thought_signature, 'test_encrypted_signature_token_123')
  })
})
