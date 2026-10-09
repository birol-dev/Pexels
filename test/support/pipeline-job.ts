import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'
import type { PipelineState } from '../../src/main/services/pipeline/context.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import type { FakeNetwork, LlmReply, LlmRequestBody } from './fake-network.ts'
import { video } from './pexels-fixtures.ts'
import { beatIdsIn, offeredKeys } from './pipeline-context.ts'

/** The Settings that make a new job run on the pipeline. */
export const PIPELINE = { agentEngine: 'pipeline' } as const

/** "Sentence 1.", "Sentence 2." and so on: one beat each in a plan that cuts at every sentence. */
export function sentences(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Sentence ${index + 1}.`)
}

/** The query `submitBeats` gives beat `n` (counting from 1). */
export function queryOfBeat(n: number): string {
  return `stock footage ${n}`
}

/** Clips for beat `n`: ids n01 to n06, enough for one search to find what a beat needs. */
export function clipsOfBeat(n: number, count = 6): PexelsVideo[] {
  return Array.from({ length: count }, (_, index) =>
    video(n * 100 + index + 1, `clip-${n}-${index + 1}`)
  )
}

/** Pexels answers each of the first `count` beats' queries with six clips. */
export function footageForBeats(network: FakeNetwork, count: number): void {
  for (let n = 1; n <= count; n++) network.pexels.videos(queryOfBeat(n), clipsOfBeat(n))
}

/**
 * The text of the last user message of a request: what the step sent. A message that carries
 * images is made of parts, and its text is the text part.
 */
export function userContentOf(request: LlmRequestBody): string {
  const content = request.messages.findLast((message) => message.role === 'user')?.content
  if (Array.isArray(content)) {
    return content.map((part) => (part.type === 'text' ? part.text : '')).join('')
  }
  return content ?? ''
}

/** The images of the last user message of a request, in the order they were attached. */
export function imagesOf(request: LlmRequestBody): Array<{ url: string; detail?: string }> {
  const content = request.messages.findLast((message) => message.role === 'user')?.content
  if (!Array.isArray(content)) return []
  return content.flatMap((part) => (part.type === 'image_url' ? [part.image_url] : []))
}

/** Whether a request carries an image anywhere in its messages. */
export function carriesImages(request: LlmRequestBody): boolean {
  return request.messages.some(
    (message) => Array.isArray(message.content) && message.content.some((p) => p.type !== 'text')
  )
}

/** The name of the one tool a request offers. */
export function toolOffered(request: LlmRequestBody): string {
  const tools = (request.tools ?? []) as Array<{ function?: { name?: string } }>
  return tools[0]?.function?.name ?? ''
}

/** The tools the pipeline asked the model for, in the order the requests were sent. */
export function toolsRequested(network: FakeNetwork): string[] {
  return network.llmRequests().map(toolOffered)
}

/**
 * Answers a ranking request with every candidate it offered for each beat, last first, so the
 * footage a beat gets is the model's choice and not the order Pexels used. `onAnswer` hears of
 * each request that was answered.
 */
export function rankLastFirst(onAnswer?: (request: LlmRequestBody) => void) {
  return (request: LlmRequestBody): LlmReply => {
    onAnswer?.(request)
    const beats = [...offeredKeys(userContentOf(request))].map(([beatId, keys]) => ({
      beatId,
      ranked: [...keys].reverse()
    }))
    return { kind: 'tools', calls: [{ name: 'submit_rankings', args: { beats } }] }
  }
}

/** Answers a broader-queries request with these queries for the beats named, if it asks for them. */
export function broaderQueries(queries: Record<string, string[]>) {
  return (request: LlmRequestBody): LlmReply => ({
    kind: 'tools',
    calls: [
      {
        name: 'submit_broader_queries',
        args: {
          beats: beatIdsIn(userContentOf(request)).map((beatId) => ({
            beatId,
            queries: queries[beatId] ?? []
          }))
        }
      }
    ]
  })
}

/** The beats a ranking request asked about. */
export function beatsRanked(request: LlmRequestBody): string[] {
  return [...offeredKeys(userContentOf(request)).keys()]
}

/** The queries of the Pexels searches sent so far, in the order they arrived. */
export function pexelsQueries(network: FakeNetwork): string[] {
  return network.pexelsRequests().map((request) => request.url.searchParams.get('query') ?? '')
}

export interface SavedPipelineFiles {
  state?: PipelineState
  agentState: Record<string, unknown>
  manifest: Record<string, unknown>
}

/** agent-state.json and manifest.json of a job, as they are on disk now. */
export async function savedFilesOf(jobId: string): Promise<SavedPipelineFiles> {
  const summary = await ProjectStore.get(jobId)
  if (!summary) throw new Error(`Job ${jobId} is not in the registry`)
  const read = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(join(summary.downloadPath, name), 'utf8')) as Record<string, unknown>
  const agentState = await read('agent-state.json')
  return {
    state: agentState.pipelineState as PipelineState | undefined,
    agentState,
    manifest: await read('manifest.json')
  }
}
