/** Official video API base (legacy https://api.pexels.com/videos/ is deprecated). */
export const PEXELS_VIDEO_SEARCH_URL = 'https://api.pexels.com/v1/videos/search'

export function pexelsVideoByIdUrl(id: number): string {
  return `https://api.pexels.com/v1/videos/videos/${id}`
}
