/** Full HD is enough for a 1080p edit. Larger files cost disk and editing time. */
const TARGET_LONG_EDGE = 1920

export interface Variant {
  label?: string
  quality?: string
  fileType?: string
  url: string
  width?: number
  height?: number
}

/** The download the app picks when the model names none. */
export function chooseVariant(candidate: {
  type: 'photo' | 'video'
  width: number
  height: number
  variants: Variant[]
}): Variant | undefined {
  return candidate.type === 'video'
    ? chooseVideoFile(candidate.variants)
    : choosePhotoVariant(candidate)
}

/** The smallest MP4 that reaches full HD, or else the largest one there is. */
export function chooseVideoFile(files: Variant[]): Variant | undefined {
  const mp4 = files.filter((f) => !f.fileType || f.fileType === 'video/mp4')
  const preferred = mp4.length > 0 ? mp4 : files
  const pool = preferred.filter((f) => f.width && f.height)
  const longEdge = (f: Variant): number => Math.max(f.width ?? 0, f.height ?? 0)
  const bigEnough = pool
    .filter((f) => longEdge(f) >= TARGET_LONG_EDGE)
    .sort((a, b) => longEdge(a) - longEdge(b))
  return bigEnough[0] ?? pool.sort((a, b) => longEdge(b) - longEdge(a))[0] ?? preferred[0]
}

/**
 * large2x is 1880 px wide for landscape sources, enough for a 1080p timeline, but only
 * 1300 px tall for portrait sources, so portrait photos use the original.
 */
export function choosePhotoVariant(candidate: {
  width: number
  height: number
  variants: Variant[]
}): Variant | undefined {
  const byLabel = (label: string): Variant | undefined =>
    candidate.variants.find((v) => v.label === label)
  const preferred = candidate.height > candidate.width ? byLabel('original') : byLabel('large2x')
  return preferred ?? byLabel('original') ?? candidate.variants[0]
}
