/**
 * Validates that a download URL is safe to fetch (HTTPS only, Pexels CDN hosts).
 * Hostname allowlisting closes the DNS-rebinding / private-IP SSRF gap left by
 * textual private-range checks alone.
 */
const ALLOWED_DOWNLOAD_HOST_SUFFIXES = ['.pexels.com']
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'images.pexels.com',
  'videos.pexels.com',
  'player.vimeo.com'
])

export function validateDownloadUrl(urlStr: string): void {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error(`Invalid URL format: ${urlStr}`)
  }

  if (url.protocol !== 'https:') {
    throw new Error(`Unauthorized protocol: ${url.protocol} (HTTPS required)`)
  }

  const hostname = url.hostname.toLowerCase()

  const isAllowedHost =
    ALLOWED_DOWNLOAD_HOSTS.has(hostname) ||
    ALLOWED_DOWNLOAD_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))

  if (!isAllowedHost) {
    throw new Error(
      `Security Check Failed: Download host is not an allowed Pexels CDN: ${hostname}`
    )
  }

  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Security Check Failed: Download URL cannot reference private network hosts.`)
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = hostname.match(ipv4Regex)
  if (match) {
    throw new Error(`Security Check Failed: Direct IP download URLs are not allowed.`)
  }

  if (hostname.startsWith('[')) {
    throw new Error(`Security Check Failed: Direct IP download URLs are not allowed.`)
  }
}
