import type { PexelsPhoto, PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'

/**
 * Replaces globalThis.fetch with a router, so a test sees every request the app makes
 * and nothing reaches the real internet. LLM replies are scripted per test; Pexels
 * searches answer from fixtures; media URLs answer with a small body.
 */

export interface RecordedRequest {
  url: URL
  method: string
  headers: Record<string, string>
  json?: unknown
}

export interface ToolCallSpec {
  name: string
  args: unknown
}

/** An OpenAI chat completion request body, as the app sent it. */
export interface LlmRequestBody {
  model: string
  messages: Array<{
    role: string
    content: string | null
    name?: string
    tool_call_id?: string
    tool_calls?: unknown[]
  }>
  tools?: unknown[]
  [key: string]: unknown
}

export type LlmReply =
  | { kind: 'tools'; calls: ToolCallSpec[]; content?: string | null }
  | { kind: 'text'; content: string }
  | { kind: 'error'; status: number; message: string }

type QueuedReply = LlmReply | ((request: LlmRequestBody) => LlmReply)

export interface ScriptedLlm {
  /** The next reply calls these tools. */
  tools(calls: ToolCallSpec[]): ScriptedLlm
  /** The next reply is plain text with no tool calls. */
  text(content: string): ScriptedLlm
  /** The next reply is an HTTP error with an OpenAI-shaped error body. */
  error(status: number, message: string): ScriptedLlm
  /** The next reply is computed from the request, for tests that react to tool results. */
  dynamic(reply: (request: LlmRequestBody) => LlmReply): ScriptedLlm
  /** Replies still waiting to be used. */
  remaining(): number
}

export interface FakePexels {
  /** Results for a photo search with this exact query. Other queries find nothing. */
  photos(query: string, results: PexelsPhoto[]): FakePexels
  /** Results for a video search with this exact query. Other queries find nothing. */
  videos(query: string, results: PexelsVideo[]): FakePexels
  /** Sent as X-Ratelimit-* headers on every Pexels API answer. `resetAt` is in epoch seconds. */
  quota: { limit: number; remaining: number; resetAt: number }
  /** The next search answers with this status instead of results. */
  failNextSearch(status: number): FakePexels
  /** The next media file request answers with this status instead of the file. */
  failNextMedia(status: number): FakePexels
}

export interface FakeNetwork {
  requests: RecordedRequest[]
  /**
   * Requests no route or script covered. They are answered with HTTP 400 so the app
   * stops instead of backing off; a passing test asserts this is empty.
   */
  problems: string[]
  /** Chat completion requests only, in order. */
  llmRequests(): LlmRequestBody[]
  /** Requests to api.pexels.com only, in order. */
  pexelsRequests(): RecordedRequest[]
  /** Requests for media files only, in order. */
  mediaRequests(): RecordedRequest[]
  llm: ScriptedLlm
  pexels: FakePexels
  restore(): void
}

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const MEDIA_BODY = new Uint8Array(1024).fill(7)

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: { message, type: 'invalid_request_error' } }, status)
}

export function installFakeNetwork(): FakeNetwork {
  const originalFetch = globalThis.fetch
  const requests: RecordedRequest[] = []
  const problems: string[] = []
  const queue: QueuedReply[] = []
  const photoResults = new Map<string, PexelsPhoto[]>()
  const videoResults = new Map<string, PexelsVideo[]>()
  let failNextSearchStatus: number | null = null
  let failNextMediaStatus: number | null = null
  let callCounter = 0

  const llm: ScriptedLlm = {
    tools(calls) {
      queue.push({ kind: 'tools', calls })
      return llm
    },
    text(content) {
      queue.push({ kind: 'text', content })
      return llm
    },
    error(status, message) {
      queue.push({ kind: 'error', status, message })
      return llm
    },
    dynamic(reply) {
      queue.push(reply)
      return llm
    },
    remaining: () => queue.length
  }

  const pexels: FakePexels = {
    photos(query, results) {
      photoResults.set(query, results)
      return pexels
    },
    videos(query, results) {
      videoResults.set(query, results)
      return pexels
    },
    quota: { limit: 20000, remaining: 19000, resetAt: Math.floor(Date.now() / 1000) + 86400 },
    failNextSearch(status) {
      failNextSearchStatus = status
      return pexels
    },
    failNextMedia(status) {
      failNextMediaStatus = status
      return pexels
    }
  }

  const quotaHeaders = (): Record<string, string> => ({
    'X-Ratelimit-Limit': String(pexels.quota.limit),
    'X-Ratelimit-Remaining': String(pexels.quota.remaining),
    'X-Ratelimit-Reset': String(pexels.quota.resetAt)
  })

  const problem = (message: string): Response => {
    problems.push(message)
    return errorResponse(400, message)
  }

  const answerLlm = (body: LlmRequestBody): Response => {
    const next = queue.shift()
    if (!next) {
      return problem(
        `The scripted LLM has no reply left for this request: ${JSON.stringify(body.messages.slice(-2))}`
      )
    }
    const reply = typeof next === 'function' ? next(body) : next
    if (reply.kind === 'error') return errorResponse(reply.status, reply.message)

    const calls = reply.kind === 'tools' ? reply.calls : []
    const content = reply.kind === 'text' ? reply.content : (reply.content ?? null)
    return jsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      model: body.model,
      choices: [
        {
          index: 0,
          finish_reason: calls.length > 0 ? 'tool_calls' : 'stop',
          message: {
            role: 'assistant',
            content,
            tool_calls:
              calls.length > 0
                ? calls.map((call) => ({
                    id: `call_${++callCounter}`,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.args) }
                  }))
                : undefined
          }
        }
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
    })
  }

  const answerPexels = (url: URL): Response => {
    const isSearch = url.pathname === '/v1/search' || url.pathname === '/v1/videos/search'
    if (isSearch && failNextSearchStatus !== null) {
      const status = failNextSearchStatus
      failNextSearchStatus = null
      return jsonResponse({ error: 'Rate limit exceeded' }, status, quotaHeaders())
    }

    const query = url.searchParams.get('query') || ''
    if (url.pathname === '/v1/search') {
      const photos = photoResults.get(query) || []
      return jsonResponse(
        { total_results: photos.length, page: 1, per_page: 15, photos },
        200,
        quotaHeaders()
      )
    }
    if (url.pathname === '/v1/videos/search') {
      const videos = videoResults.get(query) || []
      return jsonResponse(
        { total_results: videos.length, page: 1, per_page: 10, videos },
        200,
        quotaHeaders()
      )
    }

    const photoId = url.pathname.match(/^\/v1\/photos\/(\d+)$/)
    if (photoId) {
      const found = [...photoResults.values()].flat().find((p) => p.id === Number(photoId[1]))
      return found ? jsonResponse(found, 200, quotaHeaders()) : jsonResponse({}, 404)
    }
    const videoId = url.pathname.match(/^\/v1\/videos\/videos\/(\d+)$/)
    if (videoId) {
      const found = [...videoResults.values()].flat().find((v) => v.id === Number(videoId[1]))
      return found ? jsonResponse(found, 200, quotaHeaders()) : jsonResponse({}, 404)
    }
    return problem(`Unexpected network request: ${url.href}`)
  }

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method || 'GET').toUpperCase()
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const json = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    requests.push({ url, method, headers, json })

    if (init?.signal?.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError')
    }

    if (url.href === OPENAI_CHAT_URL && method === 'POST') {
      return answerLlm(json as LlmRequestBody)
    }
    if (url.hostname === 'api.pexels.com' && method === 'GET') {
      return answerPexels(url)
    }
    if (url.hostname === 'images.pexels.com' || url.hostname === 'videos.pexels.com') {
      if (failNextMediaStatus !== null) {
        const status = failNextMediaStatus
        failNextMediaStatus = null
        return new Response('Not found', { status })
      }
      return new Response(MEDIA_BODY, {
        status: 200,
        headers: {
          'content-type': url.hostname === 'images.pexels.com' ? 'image/jpeg' : 'video/mp4',
          'content-length': String(MEDIA_BODY.length)
        }
      })
    }
    return problem(`Unexpected network request: ${url.href}`)
  }) as typeof globalThis.fetch

  return {
    requests,
    problems,
    llmRequests: () =>
      requests.filter((r) => r.url.href === OPENAI_CHAT_URL).map((r) => r.json as LlmRequestBody),
    pexelsRequests: () => requests.filter((r) => r.url.hostname === 'api.pexels.com'),
    mediaRequests: () =>
      requests.filter(
        (r) => r.url.hostname === 'images.pexels.com' || r.url.hostname === 'videos.pexels.com'
      ),
    llm,
    pexels,
    restore() {
      globalThis.fetch = originalFetch
    }
  }
}
