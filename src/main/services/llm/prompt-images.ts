import { fetchValidatedDownload } from '../pexels/download-url-validation.ts'

/** The most bytes of one image sent inline to a model. A Pexels thumbnail is well under it. */
export const MAX_PROMPT_IMAGE_BYTES = 200 * 1024

/** The image types Gemini takes inline, and that Pexels serves. */
const PROMPT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface PromptImage {
  mimeType: string
  /** The image's bytes, base64 encoded. */
  data: string
}

/** Only the Pexels image host is fetched for a prompt, and only over https. */
export function isPromptImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'images.pexels.com'
  } catch {
    return false
  }
}

/**
 * Fetches one image for a model that takes bytes, not URLs. Returns null for an image that cannot be
 * used: a URL off the Pexels image host, a failed or non-image response, or one over
 * MAX_PROMPT_IMAGE_BYTES, which is never read past the cap. A pause or cancel throws instead.
 */
export async function fetchPromptImage(
  url: string,
  signal?: AbortSignal
): Promise<PromptImage | null> {
  if (!isPromptImageUrl(url)) return null
  try {
    const response = await fetchValidatedDownload(url, signal)
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const declaredBytes = Number(response.headers.get('content-length') || 0)
    if (
      !response.ok ||
      !response.body ||
      !PROMPT_IMAGE_TYPES.has(mimeType) ||
      declaredBytes > MAX_PROMPT_IMAGE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_PROMPT_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
    return { mimeType, data: Buffer.concat(chunks).toString('base64') }
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}
