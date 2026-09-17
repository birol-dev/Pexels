/** Hosts the renderer may open via shell.openExternal (https only). */
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'pexels.com',
  'birol.tech',
  'github.com',
  'openai.com',
  'openrouter.ai',
  'aistudio.google.com',
  'ai.google.dev'
])

const ALLOWED_EXTERNAL_SUFFIXES = [
  '.pexels.com',
  '.birol.tech',
  '.github.com',
  '.openai.com',
  '.openrouter.ai'
]

export function isAllowedExternalUrl(urlStr: string): boolean {
  try {
    const target = new URL(urlStr)
    if (target.protocol !== 'https:') return false
    const host = target.hostname.toLowerCase()
    return (
      ALLOWED_EXTERNAL_HOSTS.has(host) ||
      ALLOWED_EXTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
    )
  } catch {
    return false
  }
}
