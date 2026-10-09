import type { PexelsPhoto, PexelsVideo } from './pexels-types.ts'

/**
 * A search result kept for the job: everything needed to record and download it later. The
 * runner keeps these under `candidateKey`, so a pick can only be one the job really saw.
 */
export interface PexelsCandidate {
  pexelsId: number
  type: 'photo' | 'video'
  photographer: string
  photographerUrl?: string
  width: number
  height: number
  imageUrl: string
  duration?: number
  query: string
  /** What Pexels says the result shows: a photo's alt text, or the slug of its page. Only the pipeline keeps it. */
  about?: string
  variants: Array<{
    label?: string
    quality?: string
    fileType?: string
    url: string
    width?: number
    height?: number
  }>
}

/** `photo_1234` or `video_5678`: the id a candidate is kept under, and its asset record's id. */
export function candidateKey(type: 'photo' | 'video', pexelsId: number): string {
  return `${type}_${pexelsId}`
}

export function photoCandidate(photo: PexelsPhoto, query: string): PexelsCandidate {
  return {
    pexelsId: photo.id,
    type: 'photo',
    photographer: photo.photographer || 'Unknown Photographer',
    photographerUrl: photo.photographer_url || undefined,
    width: photo.width,
    height: photo.height,
    imageUrl: photo.src.medium || photo.src.original,
    query,
    variants: Object.entries(photo.src)
      .map(([label, url]) => ({ label, url: url || '' }))
      .filter(
        (v): v is { label: string; url: string } => typeof v.url === 'string' && v.url.length > 0
      )
  }
}

export function videoCandidate(video: PexelsVideo, query: string): PexelsCandidate {
  return {
    pexelsId: video.id,
    type: 'video',
    photographer: video.user?.name || 'Unknown Creator',
    photographerUrl: video.user?.url || undefined,
    width: video.width,
    height: video.height,
    imageUrl: video.image || '',
    duration: video.duration || 0,
    query,
    variants: video.video_files.map((file) => ({
      quality: file.quality || undefined,
      fileType: file.file_type || undefined,
      url: file.link,
      width: file.width ?? undefined,
      height: file.height ?? undefined
    }))
  }
}

/** The host Pexels serves its photos and video previews from. */
const PEXELS_IMAGE_HOST = 'images.pexels.com'

/**
 * Sizes a video's preview image like a photo's "tiny" size: 280 by 200, cropped. This is the
 * query Pexels itself uses for `tiny`. Whether the image CDN honours it for video previews is
 * not confirmed; a preview it serves at another size still works as a thumbnail.
 */
export const VIDEO_THUMBNAIL_QUERY = 'auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280'

/** An https URL on the Pexels image host, without credentials or a port. */
function parsePexelsImageUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    const plain = !parsed.username && !parsed.password && !parsed.port
    return parsed.protocol === 'https:' && parsed.hostname === PEXELS_IMAGE_HOST && plain
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

/**
 * A small image to show a model in place of the clip: a photo's `tiny` size, or a video's preview
 * image sized to match. Only a URL on images.pexels.com qualifies; a candidate with none (a record
 * from an older build may lack the `tiny` size) has no thumbnail and is judged by its description.
 */
export function thumbnailUrlOf(candidate: PexelsCandidate): string | undefined {
  if (candidate.type === 'photo') {
    const tiny = candidate.variants.find((variant) => variant.label === 'tiny')
    return parsePexelsImageUrl(tiny?.url)?.href
  }
  const preview = parsePexelsImageUrl(candidate.imageUrl)
  if (!preview) return undefined
  preview.search = VIDEO_THUMBNAIL_QUERY
  preview.hash = ''
  return preview.href
}
