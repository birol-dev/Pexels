import type { PexelsPhoto, PexelsVideo } from '../pexels/pexels-types.ts'

export type Shape = 'landscape' | 'portrait' | 'square'

export function shapeOf(width: number, height: number): Shape {
  const ratio = width / height
  return ratio > 1.1 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
}

export function shapeForPlatform(platform: string): Shape {
  return platform === 'YouTube' ? 'landscape' : 'portrait'
}

/** "https://www.pexels.com/video/waves-crashing-on-rocks-1234/" gives "waves crashing on rocks". */
export function slugFromPexelsUrl(url: string): string {
  const last = url.split('/').filter(Boolean).pop() || ''
  return last
    .replace(/-?\d+$/, '')
    .replace(/-/g, ' ')
    .trim()
}

/**
 * What the model sees of a photo. It judges relevance from text alone, so download URLs,
 * photographer names and preview links stay out; the full candidate is cached by the runner.
 */
export function photoResultForModel(p: PexelsPhoto): {
  pexelsId: number
  about: string
  shape: Shape
  size: string
} {
  return {
    pexelsId: p.id,
    about: p.alt || slugFromPexelsUrl(p.url),
    shape: shapeOf(p.width, p.height),
    size: `${p.width}x${p.height}`
  }
}

/** What the model sees of a video: the slug of its page is the only description it has. */
export function videoResultForModel(v: PexelsVideo): {
  pexelsId: number
  about: string
  shape: Shape
  size: string
  seconds: number
  fullHd: boolean
} {
  return {
    pexelsId: v.id,
    about: slugFromPexelsUrl(v.url),
    shape: shapeOf(v.width, v.height),
    size: `${v.width}x${v.height}`,
    seconds: v.duration || 0,
    fullHd: v.video_files.some((f) => Math.max(f.width ?? 0, f.height ?? 0) >= 1920)
  }
}
