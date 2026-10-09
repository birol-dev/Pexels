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
import { MAX_PROMPT_IMAGE_BYTES } from '../src/main/services/llm/prompt-images.ts'

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

describe('images in a user message: Gemini', () => {
  const gemini = LlmProviderFactory.getProvider('gemini')
  const BYTES_A = Uint8Array.from([1, 2, 3, 4, 5])
  const BYTES_B = Uint8Array.from([9, 8, 7])
  const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

  const imageResponse = (
    bytes: Uint8Array,
    type = 'image/jpeg',
    headers: Record<string, string> = {}
  ): Response => new Response(bytes, { status: 200, headers: { 'content-type': type, ...headers } })

  const geminiOk = (): Response =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })

  type GeminiContents = Array<{ role: string; parts: unknown[] }>

  /** Answers image requests from `images` (404 for any other) and the model call with `geminiOk`. */
  function fakeGemini(images: Record<string, () => Response>): {
    fetched: string[]
    contents(): GeminiContents
    requests(): number
  } {
    const fetched: string[] = []
    const calls: Array<{ contents: GeminiContents }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        calls.push(JSON.parse(init?.body as string) as { contents: GeminiContents })
        return geminiOk()
      }
      fetched.push(url)
      return images[url]?.() ?? new Response('gone', { status: 404 })
    }) as typeof globalThis.fetch
    return { fetched, contents: () => calls[0].contents, requests: () => calls.length }
  }

  const turn = (
    messages: AgentMessage[],
    abortSignal?: AbortSignal
  ): ReturnType<typeof gemini.createToolTurn> =>
    gemini.createToolTurn(
      {
        model: 'gemini-3-flash',
        systemPrompt: 'Rank the clips.',
        messages,
        tools: [RANK_TOOL],
        toolChoice: { name: 'submit_rankings' },
        temperature: 0.2,
        maxOutputTokens: 1000,
        abortSignal
      },
      { apiKey: 'test-key' }
    )

  it('sends each fetched image as inlineData after the text, numbered by its place in the list', async () => {
    const network = fakeGemini({
      [THUMB_A]: () => imageResponse(BYTES_A),
      [THUMB_B]: () => imageResponse(BYTES_B, 'image/png')
    })

    await turn([
      { role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }, { url: THUMB_B }] }
    ])

    assert.deepEqual([...network.fetched].sort(), [THUMB_A, THUMB_B])
    assert.deepEqual(network.contents(), [
      {
        role: 'user',
        parts: [
          { text: 'Rank these.' },
          { text: 'Thumbnail 1:' },
          { inlineData: { mimeType: 'image/jpeg', data: base64(BYTES_A) } },
          { text: 'Thumbnail 2:' },
          { inlineData: { mimeType: 'image/png', data: base64(BYTES_B) } }
        ]
      }
    ])
  })

  it('skips an image that cannot be fetched and keeps the others under their own numbers', async () => {
    const network = fakeGemini({ [THUMB_B]: () => imageResponse(BYTES_B) })

    await turn([
      { role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }, { url: THUMB_B }] }
    ])

    assert.equal(network.requests(), 1, 'the request went on')
    assert.deepEqual(network.contents()[0].parts, [
      { text: 'Rank these.' },
      { text: 'Thumbnail 2:' },
      { inlineData: { mimeType: 'image/jpeg', data: base64(BYTES_B) } }
    ])
  })

  it('skips an image that is too large, whether the response says so or not', async () => {
    const atTheCap = new Uint8Array(MAX_PROMPT_IMAGE_BYTES).fill(1)
    const overTheCap = new Uint8Array(MAX_PROMPT_IMAGE_BYTES + 1).fill(1)
    const urls = [1, 2, 3].map((n) => `https://images.pexels.com/photos/${n}/p.jpeg`)
    const network = fakeGemini({
      [urls[0]]: () => imageResponse(atTheCap),
      [urls[1]]: () => imageResponse(overTheCap),
      [urls[2]]: () =>
        imageResponse(BYTES_A, 'image/jpeg', {
          'content-length': String(MAX_PROMPT_IMAGE_BYTES + 1)
        })
    })

    await turn([{ role: 'user', content: 'Rank these.', images: urls.map((url) => ({ url })) }])

    const parts = network.contents()[0].parts
    assert.equal(
      parts.filter((part) => 'inlineData' in (part as object)).length,
      1,
      'only the image at the cap was sent'
    )
    assert.deepEqual(parts[1], { text: 'Thumbnail 1:' })
  })

  it('skips a response that is not an image Gemini takes', async () => {
    const network = fakeGemini({
      [THUMB_A]: () => imageResponse(BYTES_A, 'text/html; charset=utf-8'),
      [THUMB_B]: () => imageResponse(BYTES_B, 'image/jpeg; charset=binary')
    })

    await turn([
      { role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }, { url: THUMB_B }] }
    ])

    assert.deepEqual(network.contents()[0].parts, [
      { text: 'Rank these.' },
      { text: 'Thumbnail 2:' },
      { inlineData: { mimeType: 'image/jpeg', data: base64(BYTES_B) } }
    ])
  })

  it('never fetches a URL that is not on images.pexels.com over https', async () => {
    const refused = [
      'https://example.com/thumb.jpg',
      'http://images.pexels.com/photos/1/p.jpeg',
      'https://videos.pexels.com/video-files/1/clip.mp4',
      'https://images.pexels.com.evil.example/photos/1/p.jpeg',
      'https://192.168.0.1/photo.jpg',
      'file:///C:/photo.jpg',
      'not a url'
    ]
    const network = fakeGemini({ [THUMB_A]: () => imageResponse(BYTES_A) })

    await turn([
      {
        role: 'user',
        content: 'Rank these.',
        images: [...refused, THUMB_A].map((url) => ({ url }))
      }
    ])

    assert.deepEqual(network.fetched, [THUMB_A])
    assert.equal(network.requests(), 1)
    assert.deepEqual(network.contents()[0].parts[1], { text: 'Thumbnail 8:' })
  })

  it('stops with the job instead of sending the request when it is aborted during the images', async () => {
    const controller = new AbortController()
    let generated = 0
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        generated++
        return geminiOk()
      }
      controller.abort(new Error('paused'))
      if (init?.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
      return imageResponse(BYTES_A)
    }) as typeof globalThis.fetch

    await assert.rejects(
      turn(
        [{ role: 'user', content: 'Rank these.', images: [{ url: THUMB_A }] }],
        controller.signal
      )
    )
    assert.equal(generated, 0, 'no request went to the model')
  })

  it('sends a message without images exactly as before and fetches nothing', async () => {
    const network = fakeGemini({})

    await turn([{ role: 'user', content: 'Rank these.' }])
    assert.deepEqual(network.fetched, [])
    assert.deepEqual(network.contents(), [{ role: 'user', parts: [{ text: 'Rank these.' }] }])

    await turn([{ role: 'user', content: 'Rank these.', images: [] }])
    assert.deepEqual(network.fetched, [])
    assert.equal(network.requests(), 2)
  })
})
