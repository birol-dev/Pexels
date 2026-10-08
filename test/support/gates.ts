/**
 * Holds one request of the fake network until a test lets it go, so the test can act at a
 * moment of its choosing: while a model call is in flight, a search is waiting, or a file is
 * half downloaded. Install after installFakeNetwork(); its restore() undoes the wrap.
 */

export interface Gate {
  /** Resolves when the held request arrives. */
  reached: Promise<void>
  release(): void
}

function gateFetch(shouldHold: (url: URL) => boolean): Gate {
  const inner = globalThis.fetch
  let release = (): void => {}
  let arrive = (): void => {}
  const reached = new Promise<void>((resolve) => (arrive = resolve))
  const open = new Promise<void>((resolve) => (release = resolve))
  let held = false
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!held && shouldHold(url)) {
      held = true
      arrive()
      await open
    }
    return inner(input, init)
  }) as typeof globalThis.fetch
  return { reached, release: () => release() }
}

/** Holds the nth chat completion request (1 is the first). */
export function holdLlmRequest(nth: number): Gate {
  let seen = 0
  return gateFetch((url) => url.pathname.endsWith('/chat/completions') && ++seen === nth)
}

/** Holds the first video search for this query. */
export function holdVideoSearch(query: string): Gate {
  return gateFetch(
    (url) => url.pathname === '/v1/videos/search' && url.searchParams.get('query') === query
  )
}

/** Holds the first media file download. */
export function holdMediaDownload(): Gate {
  return gateFetch(
    (url) => url.hostname === 'videos.pexels.com' || url.hostname === 'images.pexels.com'
  )
}

/** Polls until `condition` is true. For states a test cannot wait for any other way. */
export async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now()
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('The condition never became true.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
