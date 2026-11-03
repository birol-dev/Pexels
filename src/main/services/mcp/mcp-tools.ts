import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { JobIdSchema, getJobSnapshot } from '../../ipc/jobs.ipc.ts'
import { ProjectStore } from '../storage/project-store.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import { SecureSecrets } from '../storage/secure-secrets.ts'
import {
  AGENT_TOOLS,
  SearchPexelsPhotosArgsSchema,
  SearchPexelsVideosArgsSchema,
  SelectAssetsForDownloadArgsSchema,
  DownloadSelectedAssetsArgsSchema
} from '../agent/tool-schemas.ts'
import {
  createMcpJob,
  finishOrCancelMcpJob,
  getMcpJobContext,
  requireMcpRunner
} from './mcp-jobs.ts'

const INSTRUCTIONS = `StockFinder finds and downloads Pexels footage into the desktop app.
You supply the reasoning; no AI API key is used by MCP jobs. A Pexels API key must be saved in StockFinder.
Create a job with a script or idea, or list jobs to find a pack created in the app.
For an idea-only pack, write a finished script using its idea, tone, target duration and visual style,
then call stockfinder_submit_script before planning beats. This preserves the creator's original idea.
Read its numbered sentences and constraints. Submit a beat plan covering every sentence in order,
then search Pexels for each beat, choose only returned candidates, select them, and queue downloads.
Use get_job to check progress. Request finish_job when the downloads have settled.
Respect the user's style, asset mix, limits and safety settings. If approval is required, ask the user
to review the pack in StockFinder; MCP cannot approve downloads. Resume paused jobs explicitly.
Write a script yourself if the user gives an idea. Never call the desktop's paid AI providers.
Inspect waitingOn in create/get results. If downloads are running, poll get_job until they settle
before finish_job. If a call partially fails, inspect its per-item details and retry only failed items.
Tool calls do not keep a session: always include the jobId. The app must remain open.`

async function result(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await action()
    const object =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { result: value }
    const selections = Array.isArray(object.selections) ? object.selections : []
    const rejected = selections.filter((item) => item?.status === 'rejected').length
    const failed = Array.isArray(object.failed) ? object.failed.length : 0
    if (rejected + failed > 0) {
      const succeeded =
        selections.length -
        rejected +
        (Array.isArray(object.downloaded) ? object.downloaded.length : 0)
      object.status = succeeded > 0 ? 'partial_failure' : 'failed'
      object.message = `${succeeded} item(s) processed; ${rejected + failed} failed. Inspect the per-item details and retry only failed items.`
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(object) }],
      structuredContent: object,
      ...(object.error || rejected + failed > 0 ? { isError: true } : {})
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed.' }],
      isError: true
    }
  }
}

export function createMcpProtocolServer(): McpServer {
  const server = new McpServer(
    { name: 'stockfinder', version: '1.0.0' },
    { instructions: INSTRUCTIONS, maxToolInputElements: 10000 }
  )
  const jobId = { jobId: JobIdSchema }
  const readOnly = { readOnlyHint: true, openWorldHint: false }

  server.registerTool(
    'stockfinder_status',
    {
      description: 'Check Pexels setup and StockFinder safety settings. Never returns credentials.',
      inputSchema: {},
      annotations: readOnly
    },
    () =>
      result(async () => {
        const settings = await SettingsStore.getSettings()
        return {
          hasPexelsKey: await SecureSecrets.hasSecret('pexelsKey'),
          requireApprovalBeforeDownload: settings.requireApprovalBeforeDownload,
          skipExplicitQueries: settings.skipExplicitQueries,
          avoidPeopleAndFaces: settings.avoidPeopleAndFaces,
          aiApiKeyRequired: false
        }
      })
  )
  server.registerTool(
    'stockfinder_list_jobs',
    {
      description: 'List packs in StockFinder. Use get_job to inspect a pack and its control mode.',
      inputSchema: {},
      annotations: readOnly
    },
    () => result(async () => ({ jobs: await ProjectStore.list() }))
  )
  server.registerTool(
    'stockfinder_get_job',
    {
      description: 'Read pack progress, beats, constraints and numbered script sentences.',
      inputSchema: jobId,
      annotations: readOnly
    },
    ({ jobId }) => result(() => getMcpJobContext(jobId))
  )
  server.registerTool(
    'stockfinder_create_job',
    {
      description:
        'Create a pack controlled by this MCP client from a script or idea. For an idea, write and submit its script next. No AI API key is used.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        script: z.string().trim().max(200000).default(''),
        idea: z.string().trim().max(20000).optional(),
        targetDuration: z.string().max(100).optional(),
        tone: z.string().max(500).optional(),
        platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']).default('YouTube'),
        style: z.string().trim().min(1).max(200).default('cinematic'),
        mix: z.enum(['videos only', 'photos only', 'videos + photos']).default('videos + photos'),
        maxAssetsPerBeat: z.number().int().min(1).max(10).default(1),
        maxTotalDownloads: z.number().int().min(1).max(100).default(15),
        searchMode: z.enum(['focused', 'broad']).default('focused'),
        visualConcept: z.string().max(4000).optional()
      }
    },
    (input) => result(() => createMcpJob(input))
  )
  server.registerTool(
    'stockfinder_submit_script',
    {
      description:
        'Save the finished script for an MCP pack before beat planning. Retains its original idea and settings. Returns numbered sentences for the plan.',
      inputSchema: { ...jobId, script: z.string().trim().min(1).max(200000) }
    },
    ({ jobId, script }) =>
      result(async () => {
        await (await requireMcpRunner(jobId)).submitMcpScript(script)
        return getMcpJobContext(jobId)
      })
  )
  server.registerTool(
    'stockfinder_submit_beat_plan',
    {
      description:
        'Plan footage using numbered script sentences. Each beat ends at lastSentence; beat IDs are assigned by StockFinder. Plan once before searching.',
      inputSchema: {
        ...jobId,
        beats: z
          .array(
            z.object({
              lastSentence: z.number().int().positive(),
              visualPrompt: z.string().trim().min(1).max(500),
              queries: z.array(z.string().trim().min(2).max(100)).min(1).max(3),
              assetType: z.enum(['video', 'photo', 'either'])
            })
          )
          .min(1)
          .max(100)
      }
    },
    ({ jobId, beats }) =>
      result(async () => (await requireMcpRunner(jobId)).submitMcpBeatPlan(beats))
  )

  const schemas: Record<string, z.ZodObject> = {
    search_pexels_photos: SearchPexelsPhotosArgsSchema,
    search_pexels_videos: SearchPexelsVideosArgsSchema,
    select_assets_for_download: SelectAssetsForDownloadArgsSchema.extend({
      selections: SelectAssetsForDownloadArgsSchema.shape.selections.unwrap().max(100).default([]),
      rejections: SelectAssetsForDownloadArgsSchema.shape.rejections.unwrap().max(100).default([])
    }),
    download_selected_assets: DownloadSelectedAssetsArgsSchema.extend({
      assetIds: DownloadSelectedAssetsArgsSchema.shape.assetIds.unwrap().max(100).default([])
    })
  }
  for (const tool of AGENT_TOOLS) {
    const schema = schemas[tool.name]
    if (!schema) continue
    server.registerTool(
      `stockfinder_${tool.name}`,
      {
        description: tool.description,
        inputSchema: schema.extend(jobId).shape
      },
      ({ jobId, ...args }) =>
        result(async () =>
          (await requireMcpRunner(jobId as string)).executeMcpTool(tool.name, args)
        )
    )
  }

  server.registerTool(
    'stockfinder_pause_job',
    {
      description: 'Pause an MCP pack and interrupt its in-flight work.',
      inputSchema: jobId
    },
    ({ jobId }) =>
      result(async () => {
        await (await requireMcpRunner(jobId)).pause()
        return getJobSnapshot(jobId)
      })
  )
  server.registerTool(
    'stockfinder_resume_job',
    {
      description: 'Resume a paused MCP pack. Approval must be given in StockFinder first.',
      inputSchema: jobId
    },
    ({ jobId }) =>
      result(async () => {
        await (await requireMcpRunner(jobId)).resume()
        return getJobSnapshot(jobId)
      })
  )
  server.registerTool(
    'stockfinder_cancel_job',
    {
      description: 'Cancel an MCP pack and stop its work. Downloaded files are kept.',
      inputSchema: jobId
    },
    ({ jobId }) => result(() => finishOrCancelMcpJob(jobId, 'cancel'))
  )
  server.registerTool(
    'stockfinder_finish_job',
    {
      description:
        'Finish an MCP pack after downloads settle. Requires coverage or the download limit, and no pending approval.',
      inputSchema: { ...jobId, summary: z.string().max(4000).optional() }
    },
    ({ jobId, summary }) => result(() => finishOrCancelMcpJob(jobId, 'finish', summary))
  )
  return server
}
