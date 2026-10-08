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
