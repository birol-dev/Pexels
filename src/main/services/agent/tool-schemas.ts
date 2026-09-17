import { z } from 'zod'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'

export const SearchPexelsPhotosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  color: z.string().optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(80).default(15)
})

export const SearchPexelsVideosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(80).default(10)
})

export const SelectAssetsForDownloadArgsSchema = z.object({
  selections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        variantUrl: z.string().url(),
        reason: z.string().min(1).max(500)
      })
    )
    .default([]),
  rejections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        reason: z.string().min(1).max(500)
      })
    )
    .default([])
})

export const DownloadSelectedAssetsArgsSchema = z.object({
  assetIds: z.array(
    z.object({
      assetType: z.enum(['photo', 'video']),
      pexelsId: z.number().int().positive()
    })
  )
})

export const AGENT_TOOLS: NormalizedToolDefinition[] = [
  {
    name: 'search_pexels_photos',
    description: 'Search for photos on Pexels matching a query for a script beat.',
    parameters: {
      type: 'object',
      properties: {
        beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
        query: { type: 'string', description: 'The search query keyword.' },
        orientation: {
          type: 'string',
          enum: ['landscape', 'portrait', 'square'],
          description: 'Desired orientation.'
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        color: { type: 'string', description: 'Desired dominant color.' },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 15).' }
      },
      required: ['beatId', 'query']
    }
  },
  {
    name: 'search_pexels_videos',
    description: 'Search for videos on Pexels matching a query for a script beat.',
    parameters: {
      type: 'object',
      properties: {
        beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
        query: { type: 'string', description: 'The search query keyword.' },
        orientation: {
          type: 'string',
          enum: ['landscape', 'portrait', 'square'],
          description: 'Desired orientation.'
        },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'small'],
          description: 'Desired size.'
        },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 10).' }
      },
      required: ['beatId', 'query']
    }
  },
  {
    name: 'select_assets_for_download',
    description:
      'Select candidates to be downloaded or reject candidates with a reason after search results are visible.',
    parameters: {
      type: 'object',
      properties: {
        selections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              beatId: { type: 'string', description: 'The ID of the beat.' },
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number', description: 'Pexels asset ID.' },
              variantUrl: {
                type: 'string',
                description: 'The direct download URL from the search result variants.'
              },
              reason: {
                type: 'string',
                description: 'Brief explanation of why this asset is selected.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId', 'variantUrl', 'reason']
          }
        },
        rejections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              beatId: { type: 'string', description: 'The ID of the beat.' },
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number' },
              reason: {
                type: 'string',
                description: 'Brief explanation of why this asset was rejected.'
              }
            },
            required: ['beatId', 'assetType', 'pexelsId', 'reason']
          }
        }
      },
      required: ['selections']
    }
  },
  {
    name: 'download_selected_assets',
    description: 'Queue previously selected assets to be downloaded.',
    parameters: {
      type: 'object',
      properties: {
        assetIds: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assetType: { type: 'string', enum: ['photo', 'video'] },
              pexelsId: { type: 'number' }
            },
            required: ['assetType', 'pexelsId']
          }
        }
      },
      required: ['assetIds']
    }
  }
]

/** True when every beat has ≥1 asset and all of those assets completed. */
export function areAllBeatsDownloaded(
  beats: Array<{ status: string; assets?: Array<{ status: string }> }>
): boolean {
  return (
    beats.length > 0 &&
    beats.every(
      (b) =>
        b.status === 'completed' &&
        (b.assets || []).length > 0 &&
        (b.assets || []).every((a) => a.status === 'completed')
    )
  )
}
