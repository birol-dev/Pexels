import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  LlmProviderFactory,
  LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
  resetModelRequestQuirks,
  type AgentMessage,
  type NormalizedToolDefinition
} from '../src/main/services/llm/llm-provider.ts'
import { resetLlmCircuit } from '../src/main/services/llm/llm-fetch.ts'

const originalFetch = globalThis.fetch

const THUMB_A =
  'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'
const THUMB_B =
  'https://images.pexels.com/photos/2/pexels-photo-2.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'

const RANK_TOOL: NormalizedToolDefinition = {
  name: 'submit_rankings',
  description: 'Rank.',
  parameters: { type: 'object', properties: { beats: { type: 'array' } } }
}

const TOOLS_NEED_RESPONSES_ERROR =
  "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."

interface Sent {
  url: string
  body: string
  payload: Record<string, unknown>
}

const chatOk = (): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }]
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )

const responsesOk = (): Response =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )

/** Records every request; `answer` decides the reply. */
function recordRequests(answer: (sent: Sent) => Response): Sent[] {
  const sent: Sent[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body as string
    const request = { url, body, payload: JSON.parse(body) as Record<string, unknown> }
    sent.push(request)
    return answer(request)
  }) as typeof globalThis.fetch
  return sent
}

beforeEach(() => {
  resetLlmCircuit()
  resetModelRequestQuirks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('images in a user message: OpenAI Chat Completions', () => {
  const openai = LlmProviderFactory.getProvider('openai')
  const openrouter = LlmProviderFactory.getProvider('openrouter')

  const turn = (
    provider: typeof openai,
    messages: AgentMessage[],
    model = 'gpt-4o'
  ): ReturnType<typeof openai.createToolTurn> =>
    provider.createToolTurn(
      {
        model,
        systemPrompt: 'Rank the clips.',
        messages,
        tools: [RANK_TOOL],
        toolChoice: { name: 'submit_rankings' },
        temperature: 0.2,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
      },
      { apiKey: 'sk-test' }
    )

  it('sends the text first and then one low-detail image part per image', async () => {
    const sent = recordRequests(chatOk)

    await turn(openai, [
      { role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }, { url: THUMB_B }] }
    ])

    assert.deepEqual(sent[0].payload.messages, [
      { role: 'system', content: 'Rank the clips.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Rank these.' },
          { type: 'image_url', image_url: { url: THUMB_A, detail: 'low' } },
          { type: 'image_url', image_url: { url: THUMB_B, detail: 'low' } }
        ]
      }
    ])
  })

  it('does the same on OpenRouter', async () => {
    const sent = recordRequests(chatOk)

    await turn(openrouter, [{ role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }] }])

    const messages = sent[0].payload.messages as Array<{ role: string; content: unknown }>
    assert.deepEqual(messages[1].content, [
      { type: 'text', text: 'Rank these.' },
      { type: 'image_url', image_url: { url: THUMB_A, detail: 'low' } }
    ])
  })

  it('sends a message without images exactly as before', async () => {
    const sent = recordRequests(chatOk)

    await turn(openai, [{ role: 'user', content: 'Rank these.' }])
    await turn(openai, [{ role: 'user', content: 'Rank these.', images: [] }])

    const expected = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Rank the clips.' },
        { role: 'user', content: 'Rank these.' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_rankings',
            description: 'Rank.',
            parameters: RANK_TOOL.parameters
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'submit_rankings' } },
      max_completion_tokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
      temperature: 0.2
    })
    assert.equal(sent[0].body, expected)
    assert.equal(sent[1].body, expected, 'an empty image list changes nothing')
  })
})

describe('images in a user message: OpenAI Responses API', () => {
  const openai = LlmProviderFactory.getProvider('openai')

  /** Chat Completions refuses the tools, so the turn moves to /v1/responses. */
  const responsesTurn = async (messages: AgentMessage[]): Promise<Sent> => {
    const sent = recordRequests((request) =>
      request.url.endsWith('/chat/completions')
        ? new Response(JSON.stringify({ error: { message: TOOLS_NEED_RESPONSES_ERROR } }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          })
        : responsesOk()
    )
    await openai.createToolTurn(
      {
        model: 'gpt-6-astra',
        systemPrompt: 'Rank the clips.',
        messages,
        tools: [RANK_TOOL],
        toolChoice: { name: 'submit_rankings' },
        temperature: 0.2,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS
      },
      { apiKey: 'sk-test' }
    )
    const responses = sent.find((request) => request.url.endsWith('/v1/responses'))
    assert.ok(responses, 'the turn reached the Responses API')
    return responses
  }

  it('sends input_text and then one low-detail input_image per image', async () => {
    const request = await responsesTurn([
      { role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }, { url: THUMB_B }] }
    ])

    assert.deepEqual(request.payload.input, [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Rank these.' },
          { type: 'input_image', image_url: THUMB_A, detail: 'low' },
          { type: 'input_image', image_url: THUMB_B, detail: 'low' }
        ]
      }
    ])
  })

  it('sends a message without images as plain text', async () => {
    const request = await responsesTurn([{ role: 'user', content: 'Rank these.' }])

    assert.deepEqual(request.payload.input, [{ role: 'user', content: 'Rank these.' }])
  })
})
