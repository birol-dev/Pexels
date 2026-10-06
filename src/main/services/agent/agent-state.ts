import { join } from 'path'
import { ManifestWriter } from '../files/manifest-writer.ts'
import { loadRecoverableJson } from '../storage/state-file-recovery.ts'

export type AgentStateSource = 'agent-state' | 'manifest' | 'none'

export interface LoadedAgentConversation {
  messages?: unknown
  pexelsCandidates?: unknown
  iterationsUsed: number
  source: AgentStateSource
  persistToAgentStateFile: boolean
}

interface AgentStateFile {
  messages?: unknown
  pexelsCandidates?: unknown
  iterationsUsed?: unknown
}

function toIterationCount(value: unknown): number {
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
      iterationsUsed: toIterationCount(result.value.iterationsUsed),
      source: 'agent-state',
      persistToAgentStateFile: true
    }
  }

  const fromManifest = Boolean(manifest.messages || manifest.pexelsCandidates)
  return {
    messages: manifest.messages,
    pexelsCandidates: manifest.pexelsCandidates,
    iterationsUsed: 0,
    source: fromManifest ? 'manifest' : 'none',
    persistToAgentStateFile: true
  }
}

export async function persistAgentConversationState(
  projectDir: string,
  messages: unknown,
  pexelsCandidates: Array<[string, unknown]>,
  iterationsUsed = 0
): Promise<void> {
  await ManifestWriter.writeJsonFile(projectDir, 'agent-state.json', {
    schemaVersion: 1,
    messages,
    pexelsCandidates,
    iterationsUsed
  })
}
