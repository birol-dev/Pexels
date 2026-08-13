import { isAbsolute, normalize, relative } from 'path'

export function isPathInside(parentDir: string, filePath: string): boolean {
  let normalizedParent = normalize(parentDir)
  let normalizedFile = normalize(filePath)
  if (process.platform === 'win32') {
    normalizedParent = normalizedParent.toLowerCase()
    normalizedFile = normalizedFile.toLowerCase()
  }
  const rel = relative(normalizedParent, normalizedFile)
  return isAbsolute(normalizedFile) && rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function toMediaUrl(filePath: string): string {
  return `media://local/?path=${encodeURIComponent(filePath)}`
}

export function filePathFromMediaUrl(requestUrl: string): string | null {
  try {
    const parsed = new URL(requestUrl)
    if (parsed.protocol !== 'media:') return null
    const raw = parsed.searchParams.get('path')
    if (!raw) return null
    const decoded = normalize(raw)
    return isAbsolute(decoded) ? decoded : null
  } catch {
    return null
  }
}
