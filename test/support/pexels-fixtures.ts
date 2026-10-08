import type { PexelsPhoto, PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** A photo shaped like a Pexels API result. `src.original` is the URL tests select. */
export function photo(id: number, alt: string, width = 6000, height = 4000): PexelsPhoto {
  const base = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`
  return {
    id,
    width,
    height,
    alt,
    url: `https://www.pexels.com/photo/${slugify(alt)}-${id}/`,
    photographer: 'Test Photographer',
    photographer_url: 'https://www.pexels.com/@test',
    photographer_id: 1,
    avg_color: '#808080',
    src: {
      original: base,
      large2x: `${base}?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`,
      large: `${base}?auto=compress&cs=tinysrgb&h=650&w=940`,
      medium: `${base}?auto=compress&cs=tinysrgb&h=350`,
      small: `${base}?auto=compress&cs=tinysrgb&h=130`,
      portrait: `${base}?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800`,
      landscape: `${base}?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200`,
      tiny: `${base}?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280`
    }
  }
}

export type VideoFileSpec = [quality: 'uhd' | 'hd' | 'sd', width: number, height: number]

/** A video shaped like a Pexels API result, with one file per entry of `files`. */
export function video(
  id: number,
  slug: string,
  files: VideoFileSpec[] = [
    ['uhd', 3840, 2160],
    ['hd', 1920, 1080],
    ['sd', 960, 540]
  ],
  duration = 12
): PexelsVideo {
  return {
    id,
    width: files[0][1],
    height: files[0][2],
    duration,
    url: `https://www.pexels.com/video/${slug}-${id}/`,
    image: `https://images.pexels.com/videos/${id}/pictures/preview-0.jpeg`,
    user: { id: 1, name: 'Test Creator', url: 'https://www.pexels.com/@creator' },
    video_files: files.map(([quality, w, h], index) => ({
      id: id * 10 + index,
      quality,
      file_type: 'video/mp4',
      width: w,
      height: h,
      fps: 25,
      link: `https://videos.pexels.com/video-files/${id}/${id}-${quality}_${w}_${h}_25fps.mp4`
    })),
    video_pictures: []
  }
}

/** The download URL of one file of a fixture video. */
export function videoFileUrl(item: PexelsVideo, quality: 'uhd' | 'hd' | 'sd'): string {
  const file = item.video_files.find((f) => f.quality === quality)
  if (!file) throw new Error(`Fixture video ${item.id} has no ${quality} file`)
  return file.link
}
