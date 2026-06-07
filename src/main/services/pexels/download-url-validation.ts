/**
 * Validates that a download URL is safe to fetch (HTTPS/HTTP only, no private-network targets).
 */
export function validateDownloadUrl(urlStr: string): void {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error(`Invalid URL format: ${urlStr}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unauthorized protocol: ${url.protocol}`)
  }

  const hostname = url.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Security Check Failed: Download URL cannot reference private network hosts.`)
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = hostname.match(ipv4Regex)
  if (match) {
    const parts = match.slice(1).map(Number)
    if (parts.some((p) => p < 0 || p > 255)) {
      throw new Error(`Invalid IP address format.`)
    }

    const [p1, p2] = parts
    if (
      p1 === 127 ||
      p1 === 10 ||
      (p1 === 172 && p2 >= 16 && p2 <= 31) ||
      (p1 === 192 && p2 === 168) ||
      (p1 === 169 && p2 === 254) ||
      p1 === 0
    ) {
      throw new Error(`Security Check Failed: Download URL cannot reference private network hosts.`)
    }
  }

  if (
    hostname === '[::1]' ||
    hostname === '[::]' ||
    hostname.startsWith('[fe80:') ||
    hostname.startsWith('[fc00:') ||
    hostname.startsWith('[fd00:') ||
    hostname.startsWith('[ff00:')
  ) {
    throw new Error(`Security Check Failed: Download URL cannot reference private network hosts.`)
  }
}
