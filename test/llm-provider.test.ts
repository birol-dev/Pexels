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
    assert.equal(capturedPayload?.max_completion_tokens, 1000)
    assert.equal(capturedPayload?.max_tokens, undefined)
    assert.equal(capturedPayload?.cache_control, undefined)
    assert.equal(capturedPayload?.session_id, undefined)
    const messages = capturedPayload?.messages as Array<{ role: string }>
    assert.equal(messages?.[0]?.role, 'system')
    assert.equal(messages?.[1]?.role, 'user')
    const tools = capturedPayload?.tools as Array<{ function: { name: string } }>
    assert.equal(tools?.[0]?.function?.name, 'search_pexels_photos')
    // Do not enable strict tool schemas (our schemas are not OpenAI-strict compliant)
    assert.equal((tools?.[0] as { function?: { strict?: unknown } })?.function?.strict, undefined)
    assert.equal((tools?.[0] as { strict?: unknown })?.strict, undefined)

    assert.equal(result.stopReason, 'tool_calls')
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].name, 'search_pexels_photos')
    assert.equal(result.toolCalls[0].arguments, '{"query":"mountains"}')
    assert.equal(result.usage?.totalTokens, 40)
  })

  it('allows content null on outbound assistant messages that have tool_calls', async () => {
    let capturedPayload: Record<string, unknown> | null = null

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: { content: 'done', tool_calls: undefined },
              finish_reason: 'stop'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    await provider.createToolTurn(
      {
        model: 'gpt-4o',
        systemPrompt: 'You are an assistant',
        messages: [
          { role: 'user', content: 'Find mountains' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                name: 'search_pexels_photos',
                arguments: '{"query":"mountains"}'
              }
            ]
          },
          {
            role: 'tool',
            tool_call_id: 'call_abc',
            name: 'search_pexels_photos',
            content: '{"results":[]}'
          }
        ],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 500
      },
      { apiKey: 'sk-test' }
    )

    const messages = capturedPayload?.messages as Array<{
      role: string
      content: string | null
      tool_calls?: unknown[]
    }>
    const assistantMsg = messages.find((m) => m.role === 'assistant')
    assert.ok(assistantMsg)
    assert.equal(assistantMsg?.content, null)
    assert.ok(assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0)
  })

  it('sets stopReason tool_calls when tool_calls present even if finish_reason is stop', async () => {
    globalThis.fetch = (async () =>
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
                    id: 'call_xyz',
                    type: 'function',
                    function: { name: 'search_pexels_photos', arguments: '{"query":"x"}' }
                  }
                ]
              },
              finish_reason: 'stop'
            }
          ]
        })
      }) as Response) as typeof globalThis.fetch

    const result = await provider.createToolTurn(
      {
        model: 'gpt-4o',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.1,
        maxOutputTokens: 100
      },
      { apiKey: 'sk-test' }
    )
    assert.equal(result.stopReason, 'tool_calls')
    assert.equal(result.toolCalls.length, 1)
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

  it('uses max_tokens (not max_completion_tokens) in createToolTurn payload', async () => {
    let capturedPayload: Record<string, unknown> | null = null

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: { content: 'ok', tool_calls: undefined },
              finish_reason: 'stop'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    await provider.createToolTurn(
      {
        model: 'google/gemini-2.5-flash',
        systemPrompt: 'You are an assistant',
        messages: [{ role: 'user', content: 'hi' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 800
      },
      { apiKey: 'sk-or-v1-test' }
    )

    assert.equal(capturedPayload?.max_tokens, 800)
    assert.equal(capturedPayload?.max_completion_tokens, undefined)
    assert.equal(capturedPayload?.model, 'google/gemini-2.5-flash')
    assert.deepEqual(capturedPayload?.cache_control, { type: 'ephemeral' })
  })

  it('pins OpenRouter sticky routing with session_id and prompt_cache_key', async () => {
    let capturedPayload: Record<string, unknown> | null = null

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [
            {
              message: { content: 'ok', tool_calls: undefined },
              finish_reason: 'stop'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    await provider.createToolTurn(
      {
        model: 'deepseek/deepseek-v4.1-flash:floor',
        systemPrompt: 'You are StockScout',
        messages: [{ role: 'user', content: 'search now' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 800,
        sessionId: `stockfinder:job_123`
      },
      { apiKey: 'sk-or-v1-test' }
    )

    assert.equal(capturedPayload?.session_id, 'stockfinder:job_123')
    assert.equal(capturedPayload?.prompt_cache_key, 'stockfinder:job_123')
    assert.deepEqual(capturedPayload?.cache_control, { type: 'ephemeral' })
    const messages = capturedPayload?.messages as Array<{ role: string; content: string }>
    assert.equal(messages?.[0]?.role, 'system')
    assert.equal(messages?.[0]?.content, 'You are StockScout')
    assert.equal(messages?.[1]?.content, 'search now')
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

  it('prefers API functionCall.id when present', async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: 'api_call_42',
                      name: 'search_pexels_photos',
                      args: { query: 'ocean' }
                    }
                  }
                ]
              },
              finishReason: 'STOP'
            }
          ]
        })
      }) as Response) as typeof globalThis.fetch

    const result = await provider.createToolTurn(
      {
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Find ocean photos' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 500
      },
      { apiKey: 'AIzaSyTestKey' }
    )

    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].id, 'api_call_42')
    assert.equal(result.toolCalls[0].name, 'search_pexels_photos')
  })

  it('excludes thought-only parts from assistantMessage.content', async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Internal reasoning about the query', thought: true },
                  { text: 'Here is a good ocean shot' },
                  {
                    functionCall: {
                      name: 'search_pexels_photos',
                      args: { query: 'ocean' }
                    }
                  }
                ]
              },
              finishReason: 'STOP'
            }
          ]
        })
      }) as Response) as typeof globalThis.fetch

    const result = await provider.createToolTurn(
      {
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Find ocean photos' }],
        tools: sampleTools,
        toolChoice: 'auto',
        temperature: 0.2,
        maxOutputTokens: 500
      },
      { apiKey: 'AIzaSyTestKey' }
    )

    assert.equal(result.assistantMessage.content, 'Here is a good ocean shot')
    assert.ok(!result.assistantMessage.content?.includes('Internal reasoning'))
    assert.equal(result.assistantMessage.rawParts?.length, 3)
  })

  it('includes functionResponse.id matching tool_call_id on follow-up', async () => {
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
              content: { parts: [{ text: 'Done' }] },
              finishReason: 'STOP'
            }
          ]
        })
      } as Response
    }) as typeof globalThis.fetch

    await provider.createToolTurn(
      {
        model: 'gemini-3.8-flash',
        systemPrompt: 'You are StockScout',
        messages: [
          { role: 'user', content: 'Find stock clips' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'api_call_99',
                name: 'search_pexels_photos',
                arguments: '{"query":"forest"}'
              }
            ]
          },
          {
            role: 'tool',
            name: 'search_pexels_photos',
            tool_call_id: 'api_call_99',
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
      parts: Array<{ functionResponse?: { name: string; id?: string; response: unknown } }>
    }>
    const toolContent = contents.find((c) =>
      c.parts.some((p) => p.functionResponse?.name === 'search_pexels_photos')
    )
    assert.ok(toolContent)
    const fr = toolContent?.parts.find((p) => p.functionResponse)?.functionResponse
    assert.equal(fr?.id, 'api_call_99')
  })

  it('strips $schema from tool parameters', async () => {
    let capturedPayload: Record<string, unknown> | null = null

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string) as Record<string, unknown>
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }]
        })
      } as Response
    }) as typeof globalThis.fetch

    const toolsWithSchema: NormalizedToolDefinition[] = [
      {
        name: 'search_pexels_photos',
        description: 'Search',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          // @ts-expect-error intentional unsupported field for strip test
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      }
    ]

    await provider.createToolTurn(
      {
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: toolsWithSchema,
        toolChoice: 'auto',
        temperature: 0.1,
        maxOutputTokens: 50
      },
      { apiKey: 'AIzaSyTestKey' }
    )

    const tools = capturedPayload?.tools as Array<{
      functionDeclarations: Array<{ parameters: Record<string, unknown> }>
    }>
    assert.equal(tools?.[0]?.functionDeclarations?.[0]?.parameters?.$schema, undefined)
    assert.equal(tools?.[0]?.functionDeclarations?.[0]?.parameters?.type, 'OBJECT')
  })
})
