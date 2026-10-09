import { ApiError } from '../http/api-errors.ts'

export const PEXELS_KEY_MISSING_MESSAGE = 'Pexels API Key is missing. Please set it in Settings.'

/** A failure no other query can get past: the key is missing or Pexels refused it. */
export function isUnrecoverablePexelsError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return (
    error.message === PEXELS_KEY_MISSING_MESSAGE ||
    error.statusCode === 401 ||
    error.statusCode === 403
  )
}
