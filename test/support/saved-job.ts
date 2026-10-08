import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectStore, type JobSummary } from '../../src/main/services/storage/project-store.ts'
import { nextJobId } from './run-job.ts'

/** A beat whose only asset has finished downloading. */
export function downloadedBeat(id = 'beat_1'): Record<string, unknown> {
  return {
    id,
    text: 'One sentence.',
    visualPrompt: 'busy city street',
    searchQueries: ['city street'],
    status: 'completed',
    assets: [
      {
        id: 'video_101',
        pexelsId: 101,
        type: 'video',
        url: 'https://videos.pexels.com/video-files/101/city-hd.mp4',
        imageUrl: 'https://images.pexels.com/videos/101/city.jpeg',
        downloadUrl: 'https://videos.pexels.com/video-files/101/city-hd.mp4',
        width: 1920,
        height: 1080,
        duration: 12,
        photographer: 'Test Creator',
        query: 'city street',
        status: 'completed'
      }
    ]
  }
}

/** A beat that has no asset yet. */
export function emptyBeat(id = 'beat_2'): Record<string, unknown> {
  return {
    id,
    text: 'Another sentence.',
    visualPrompt: 'city traffic',
    searchQueries: [],
    status: 'pending',
    assets: []
  }
}

export interface SavedJobOptions {
  status?: JobSummary['status']
  /** Written as manifest.beats. Defaults to one downloaded beat. */
  beats?: unknown[]
  /** Merged over the manifest's settingsSnapshot. */
  snapshot?: Record<string, unknown>
  /** What agent-state.json holds. Null writes no file. */
  agentState?: Record<string, unknown> | null
  /** Write no manifest.json, or one that is not valid JSON. */
  manifest?: 'missing' | 'corrupt'
}

/**
 * Writes a job to the registry and its project folder, the way an earlier session of the
 * app left it. No runner exists for it until a test creates one.
 */
export async function writeSavedJob(
  options: SavedJobOptions = {}
): Promise<{ jobId: string; projectDir: string }> {
  const jobId = nextJobId()
  const projectDir = join(await mkdtemp(join(tmpdir(), 'stockfinder-saved-')), 'saved-job')
  await mkdir(projectDir, { recursive: true })

  const now = new Date().toISOString()
  await ProjectStore.save({
    jobId,
    projectName: 'saved-job',
    title: 'Saved job',
    script: 'One sentence.',
    status: options.status ?? 'paused',
    createdAt: now,
    updatedAt: now,
    downloadPath: projectDir,
    assetCount: 0
  })

  if (options.manifest === 'corrupt') {
    await writeFile(join(projectDir, 'manifest.json'), '{ not json')
  } else if (options.manifest !== 'missing') {
    await writeFile(
      join(projectDir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        projectId: jobId,
        title: 'Saved job',
        createdAt: now,
        script: 'One sentence.',
        settingsSnapshot: {
          provider: 'openai',
          modelId: 'gpt-4o',
          targetPlatform: 'YouTube',
          visualStyle: 'cinematic',
          assetMix: 'videos_and_photos',
          maxAssetsPerBeat: 1,
          maxTotalDownloads: 10,
          searchMode: 'focused',
          ...options.snapshot
        },
        beats: options.beats ?? [downloadedBeat()],
        assets: [],
        failures: []
      })
    )
  }

  if (options.agentState !== null) {
    await writeFile(
      join(projectDir, 'agent-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        messages: [{ role: 'user', content: 'Begin searching for stock assets.' }],
        pexelsCandidates: [],
        iterationsUsed: 1,
        ...options.agentState
      })
    )
  }
  return { jobId, projectDir }
}
