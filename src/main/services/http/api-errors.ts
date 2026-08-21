export type ApiErrorKind = 'transient' | 'permanent'

export class ApiError extends Error {
  public readonly kind: ApiErrorKind
  public readonly statusCode?: number
  public readonly retryAfterMs?: number
  public readonly cause?: unknown

  constructor(
    message: string,
    kind: ApiErrorKind,
    statusCode?: number,
    retryAfterMs?: number,
    cause?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.statusCode = statusCode
    this.retryAfterMs = retryAfterMs
    this.cause = cause
  }

  get isRetryable(): boolean {
    return this.kind === 'transient'
  }
}

export function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined
  const asNumber = Number(header)
  if (!Number.isNaN(asNumber)) return Math.max(0, asNumber * 1000)
  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  return undefined
}

export function classifyHttpStatus(status: number, retryAfterHeader?: string | null): ApiError {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader)

  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return new ApiError(`HTTP ${status}`, 'transient', status, retryAfterMs)
  }

  if (status === 401 || status === 403) {
    return new ApiError(`HTTP ${status}: authentication failed`, 'permanent', status)
  }

  return new ApiError(`HTTP ${status}`, 'permanent', status)
}

export function classifyFetchError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new ApiError(
        'Request timed out or was aborted',
        'transient',
        undefined,
        undefined,
        error
      )
    }
    return new ApiError(error.message, 'transient', undefined, undefined, error)
  }

  return new ApiError(String(error), 'transient')
}

export function backoffDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && retryAfterMs > 0) return retryAfterMs

  const base = 500
  const max = 30_000
  const exponential = Math.min(base * 2 ** attempt, max)
  const jitter = Math.random() * 0.3 * exponential
  return Math.round(exponential + jitter)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('Request aborted', 'permanent'))
      return
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = (): void => {
      clearTimeout(timeoutId)
      reject(new ApiError('Request aborted', 'permanent'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface FetchWithRetryOptions {
  init?: RequestInit
  maxRetries?: number
  label?: string
  onRetry?: (attempt: number, error: ApiError, delayMs: number) => void
  isAborted?: () => boolean
}

export function extractErrorMessage(errText: string): string {
  if (!errText) return ''
  try {
    const parsed = JSON.parse(errText) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (obj.error) {
        if (typeof obj.error === 'string') return obj.error
        if (typeof obj.error === 'object' && obj.error !== null) {
          const nested = obj.error as Record<string, unknown>
          if (typeof nested.message === 'string') return nested.message
        }
      }
      if (typeof obj.message === 'string') return obj.message
    }
  } catch {
    // Not JSON, return trimmed string below
  }
  return errText.slice(0, 300).trim()
}

export function parseRetryFromBody(bodyText: string): number | undefined {
  if (!bodyText) return undefined
  const match = bodyText.match(/retry (?:in|after)\s+([0-9.]+)\s*(s|sec|seconds|ms)?/i)
  if (match) {
    const val = parseFloat(match[1])
    if (!Number.isNaN(val) && val > 0) {
      const unit = (match[2] || 's').toLowerCase()
      const ms = unit.startsWith('ms') ? val : val * 1000
      return Math.min(ms + 500, 60_000)
    }
  }
  return undefined
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3
  let lastError: ApiError | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.isAborted?.()) {
      throw new ApiError('Request aborted', 'permanent')
    }

    try {
      const response = await fetch(url, options.init)

      if (response.ok) {
        return response
      }

      const retryAfter = response.headers.get('Retry-After')
      const rawErrText = await response.text().catch(() => '')
      const detailedMsg = extractErrorMessage(rawErrText)
      const bodyRetryAfterMs = parseRetryFromBody(rawErrText)
      const apiError = classifyHttpStatus(response.status, retryAfter)
      if (apiError.retryAfterMs === undefined && bodyRetryAfterMs !== undefined) {
        ;(apiError as { retryAfterMs?: number }).retryAfterMs = bodyRetryAfterMs
      }
      apiError.message = `${options.label || 'Request'} failed: HTTP ${response.status}${
        detailedMsg ? `: ${detailedMsg}` : ''
      }`

      if (!apiError.isRetryable || attempt === maxRetries) {
        throw apiError
      }

      lastError = apiError
      const delay = backoffDelayMs(attempt, apiError.retryAfterMs)
      options.onRetry?.(attempt + 1, apiError, delay)
      await sleep(delay, options.init?.signal ?? undefined)
    } catch (error) {
      if (options.isAborted?.() || options.init?.signal?.aborted) {
        throw error instanceof ApiError && !error.isRetryable
          ? error
          : new ApiError('Request aborted', 'permanent')
      }

      const apiError = classifyFetchError(error)
      if (!apiError.isRetryable || attempt === maxRetries) {
        throw apiError
      }

      lastError = apiError
      const delay = backoffDelayMs(attempt, apiError.retryAfterMs)
      options.onRetry?.(attempt + 1, apiError, delay)
      await sleep(delay, options.init?.signal ?? undefined)
    }
  }

  throw lastError || new ApiError('Request failed after retries', 'transient')
}

export class ApiCircuitBreaker {
  private failures = 0
  private openUntil = 0
  private readonly threshold: number
  private readonly cooldownMs: number

  constructor(threshold = 5, cooldownMs = 60_000) {
    this.threshold = threshold
    this.cooldownMs = cooldownMs
  }

  public recordSuccess(): void {
    this.failures = 0
    this.openUntil = 0
  }

  public recordFailure(): void {
    this.failures++
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.cooldownMs
    }
  }

  public reset(): void {
    this.failures = 0
    this.openUntil = 0
  }

  public isOpen(): boolean {
    return Date.now() < this.openUntil
  }

  public ensureClosed(label: string): void {
    if (this.isOpen()) {
      throw new ApiError(
        `${label}: too many consecutive failures — pausing requests temporarily`,
        'transient'
      )
    }
  }
}
