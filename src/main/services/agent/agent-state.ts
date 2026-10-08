import { promises as fs } from 'fs'
import { join } from 'path'
import { ManifestWriter } from '../files/manifest-writer.ts'
import { loadRecoverableJson } from '../storage/state-file-recovery.ts'
import { parsePipelineState, type PipelineState } from '../pipeline/context.ts'
import { parseRuntimeSettings, type JobRuntimeSettings } from './job-settings.ts'
import type { StatusReason } from './job-status.ts'

export type AgentStateSource = 'agent-state' | 'manifest' | 'none'

export interface LoadedAgentConversation {
  messages?: unknown
  pexelsCandidates?: unknown
  iterationsUsed: number
  /** Message index before which large tool results are digested. Old state files have none. */
  compactedBefore: number
  /** Where a pipeline job stopped. Loop jobs and old state files have none. */
  pipelineState?: PipelineState
  source: AgentStateSource
  persistToAgentStateFile: boolean
}

interface AgentStateFile {
  messages?: unknown
  pexelsCandidates?: unknown
  iterationsUsed?: unknown
  compactedBefore?: unknown
  statusReason?: unknown
  runtimeSettings?: unknown
  pipelineState?: unknown
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function isAgentStateFile(value: unknown): value is AgentStateFile {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function shouldEmbedConversationInManifest(agentStateFileTrusted: boolean): boolean {
  return !agentStateFileTrusted
}

/**
 * Loads conversation + candidate index from agent-state.json, falling back to
 * a legacy manifest that stored those fields inline. I/O errors on the state
 * file do not quarantine or overwrite it; the caller must keep embedding the
 * conversation in the manifest until a later persist succeeds.
 */
export async function loadAgentConversationState(
  projectDir: string,
  manifest: Record<string, unknown>
): Promise<LoadedAgentConversation> {
  const statePath = join(projectDir, 'agent-state.json')
  const result = await loadRecoverableJson(statePath, isAgentStateFile)

  if (result.status === 'unavailable') {
    const fromManifest = Boolean(manifest.messages || manifest.pexelsCandidates)
    return {
      messages: manifest.messages,
      pexelsCandidates: manifest.pexelsCandidates,
      iterationsUsed: 0,
      compactedBefore: 0,
      source: fromManifest ? 'manifest' : 'none',
      persistToAgentStateFile: false
    }
  }

  if (result.status === 'ok' && Array.isArray(result.value.messages)) {
    return {
      messages: result.value.messages,
      pexelsCandidates: Array.isArray(result.value.pexelsCandidates)
        ? result.value.pexelsCandidates
        : manifest.pexelsCandidates,
      iterationsUsed: toCount(result.value.iterationsUsed),
      compactedBefore: toCount(result.value.compactedBefore),
      pipelineState: parsePipelineState(result.value.pipelineState),
      source: 'agent-state',
      persistToAgentStateFile: true
    }
  }

  const fromManifest = Boolean(manifest.messages || manifest.pexelsCandidates)
  return {
    messages: manifest.messages,
    pexelsCandidates: manifest.pexelsCandidates,
    iterationsUsed: 0,
    compactedBefore: 0,
    source: fromManifest ? 'manifest' : 'none',
    persistToAgentStateFile: true
  }
}

export async function persistAgentConversationState(
  projectDir: string,
  messages: unknown,
  pexelsCandidates: Array<[string, unknown]>,
  iterationsUsed = 0,
  compactedBefore = 0,
  /** Why the job last changed status, for showing a paused job's reason after a restart. */
  statusReason?: StatusReason,
  /** What the job runs with. Fixed when the job is created. */
  runtimeSettings?: JobRuntimeSettings,
  /** Where a pipeline job stopped, so a resume or a restart carries on from there. */
  pipelineState?: PipelineState
): Promise<void> {
  await ManifestWriter.writeJsonFile(projectDir, 'agent-state.json', {
    schemaVersion: 1,
    messages,
    pexelsCandidates,
    iterationsUsed,
    compactedBefore,
    statusReason,
    runtimeSettings,
    pipelineState
  })
}

/**
 * What agent-state.json says about a job's status and settings. A plain read: it never
 * quarantines or rewrites the file, and a missing or unreadable one says nothing.
 */
export async function readSavedAgentState(
  projectDir: string
): Promise<{ statusReason?: unknown; runtimeSettings?: JobRuntimeSettings }> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(join(projectDir, 'agent-state.json'), 'utf-8')
    )
    return isAgentStateFile(parsed)
      ? {
          statusReason: parsed.statusReason,
          runtimeSettings: parseRuntimeSettings(parsed.runtimeSettings)
        }
      : {}
  } catch {
    return {}
  }
}
