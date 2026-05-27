import { z } from 'zod'

// Photo schemas
export const PexelsPhotoSchema = z
  .object({
    id: z.number(),
    width: z.number(),
    height: z.number(),
    url: z.string(),
    photographer: z.string(),
    photographer_url: z.string().optional(),
    photographer_id: z.number().optional(),
    avg_color: z.string().nullable().optional(),
    src: z.object({
      original: z.string(),
      large2x: z.string().optional(),
      large: z.string().optional(),
      medium: z.string().optional(),
      small: z.string().optional(),
      portrait: z.string().optional(),
      landscape: z.string().optional(),
      tiny: z.string().optional()
    }),
    alt: z.string().nullable().optional()
  })
  .passthrough()

export type PexelsPhoto = z.infer<typeof PexelsPhotoSchema>

export const PexelsPhotoSearchResultSchema = z
  .object({
    total_results: z.number(),
    page: z.number(),
    per_page: z.number(),
    photos: z.array(PexelsPhotoSchema)
  })
  .passthrough()

export type PexelsPhotoSearchResult = z.infer<typeof PexelsPhotoSearchResultSchema>

// Video schemas
export const PexelsVideoFileSchema = z
  .object({
    id: z.number(),
    quality: z.string(),
    file_type: z.string(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    link: z.string()
  })
  .passthrough()

export type PexelsVideoFile = z.infer<typeof PexelsVideoFileSchema>

export const PexelsVideoPictureSchema = z
  .object({
    id: z.number(),
    picture: z.string(),
    nr: z.number()
  })
  .passthrough()

export const PexelsVideoSchema = z
  .object({
    id: z.number(),
    width: z.number(),
    height: z.number(),
    url: z.string(),
    image: z.string(),
    duration: z.number(),
    user: z.object({
      id: z.number(),
      name: z.string(),
      url: z.string().optional()
    }),
    video_files: z.array(PexelsVideoFileSchema),
    video_pictures: z.array(PexelsVideoPictureSchema).optional()
  })
  .passthrough()

export type PexelsVideo = z.infer<typeof PexelsVideoSchema>

export const PexelsVideoSearchResultSchema = z
  .object({
    total_results: z.number(),
    page: z.number(),
    per_page: z.number(),
    videos: z.array(PexelsVideoSchema)
  })
  .passthrough()

export type PexelsVideoSearchResult = z.infer<typeof PexelsVideoSearchResultSchema>

// Inputs
export interface PexelsPhotoSearchInput {
  query: string
  orientation?: 'landscape' | 'portrait' | 'square'
  size?: 'large' | 'medium' | 'small'
  color?: string
  locale?: string
  page?: number
  per_page?: number
}

export interface PexelsVideoSearchInput {
  query: string
  orientation?: 'landscape' | 'portrait' | 'square'
  size?: 'large' | 'medium' | 'small'
  locale?: string
  page?: number
  per_page?: number
}
