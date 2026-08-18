import { z } from 'zod'

// Photo schemas
export const PexelsPhotoSchema = z
  .object({
    id: z.number(),
    width: z.number(),
    height: z.number(),
    url: z.string(),
    photographer: z.string().nullable().optional(),
    photographer_url: z.string().nullable().optional(),
    photographer_id: z.number().nullable().optional(),
    avg_color: z.string().nullable().optional(),
    src: z
      .object({
        original: z.string(),
        large2x: z.string().nullable().optional(),
        large: z.string().nullable().optional(),
        medium: z.string().nullable().optional(),
        small: z.string().nullable().optional(),
        portrait: z.string().nullable().optional(),
        landscape: z.string().nullable().optional(),
        tiny: z.string().nullable().optional()
      })
      .passthrough(),
    alt: z.string().nullable().optional()
  })
  .passthrough()

export type PexelsPhoto = z.infer<typeof PexelsPhotoSchema>

export const PexelsPhotoSearchResultSchema = z
  .object({
    total_results: z.number(),
    page: z.number().optional(),
    per_page: z.number().optional(),
    photos: z.array(PexelsPhotoSchema)
  })
  .passthrough()

export type PexelsPhotoSearchResult = z.infer<typeof PexelsPhotoSearchResultSchema>

// Video schemas
export const PexelsVideoFileSchema = z
  .object({
    id: z.number().optional(),
    quality: z.string().nullable().optional(),
    file_type: z.string().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    fps: z.number().nullable().optional(),
    link: z.string()
  })
  .passthrough()

export type PexelsVideoFile = z.infer<typeof PexelsVideoFileSchema>

export const PexelsVideoPictureSchema = z
  .object({
    id: z.number().optional(),
    picture: z.string(),
    nr: z.number().optional()
  })
  .passthrough()

export const PexelsVideoSchema = z
  .object({
    id: z.number(),
    width: z.number(),
    height: z.number(),
    url: z.string(),
    image: z.string().nullable().optional(),
    duration: z.number().optional(),
    user: z
      .object({
        id: z.number().optional(),
        name: z.string().nullable().optional(),
        url: z.string().nullable().optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    video_files: z.array(PexelsVideoFileSchema),
    video_pictures: z.array(PexelsVideoPictureSchema).nullable().optional()
  })
  .passthrough()

export type PexelsVideo = z.infer<typeof PexelsVideoSchema>

export const PexelsVideoSearchResultSchema = z
  .object({
    total_results: z.number(),
    page: z.number().optional(),
    per_page: z.number().optional(),
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
