import { ipcMain, shell } from 'electron'
import { ProjectStore } from '../services/storage/project-store.ts'
import { promises as fs } from 'fs'
import { join } from 'path'
import { AgentRunner, type AssetRecord, type VisualBeat } from '../services/agent/agent-runner.ts'
import { buildManifestAttribution } from '../services/pexels/pexels-attribution.ts'
import { PexelsClient } from '../services/pexels/pexels-client.ts'
import { ManifestWriter } from '../services/files/manifest-writer.ts'
import { isPathInside } from '../services/files/path-safety.ts'
import { moveFileToTrash } from '../services/files/trash-file.ts'
import { z } from 'zod'

const JobIdSchema = z.string().regex(/^job_\d+$/)
const AssetIdSchema = z.string().regex(/^(photo|video)_\d+$/)

/** Completed assets whose file is no longer on disk. */
async function findMissingFiles(beats: VisualBeat[]): Promise<AssetRecord[]> {
  const completed = beats.flatMap((beat) =>
    (beat.assets || []).filter((asset) => asset.status === 'completed' && asset.filePath)
  )
  const present = await Promise.all(
    completed.map((asset) =>
      fs.access(asset.filePath!).then(
        () => true,
        () => false
      )
    )
  )
  return completed.filter((_, i) => !present[i])
}

function listAssets(beats: VisualBeat[]): unknown[] {
  return beats.flatMap((beat) =>
    (beat.assets || []).map((asset) => ({ ...asset, beatId: beat.id, beatText: beat.text }))
  )
}

export function registerAssetsHandlers(): void {
  ipcMain.handle('assets:list', async (_, rawJobId: unknown): Promise<unknown[]> => {
    const jobId = JobIdSchema.parse(rawJobId)

    // A job with a runner is written by that runner alone, so its memory is the truth.
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      const missing = await findMissingFiles(runner.getSnapshot().beats)
      if (missing.length > 0) await runner.markFilesMissing(missing.map((asset) => asset.id))
      return listAssets(runner.getSnapshot().beats)
    }

    const summary = await ProjectStore.get(jobId)
    if (!summary) return []

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

      const beats = manifest.beats || []
      const missing = await findMissingFiles(beats)
      for (const asset of missing) {
        asset.status = 'failed'
        asset.error = 'File not found on disk'
        asset.filePath = undefined
      }

      // Persist corrections so manifest stays in sync (queued + atomic)
      if (missing.length > 0) {
        ManifestWriter.writeJsonFile(summary.downloadPath, 'manifest.json', manifest).catch((err) =>
          console.error('Failed to update manifest after file-existence check:', err)
        )
      }

      return listAssets(beats)
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'assets:openInFolder',
    async (_, rawJobId: unknown, rawAssetId: unknown): Promise<void> => {
      const jobId = JobIdSchema.parse(rawJobId)
      const assetId = AssetIdSchema.parse(rawAssetId)
      const summary = await ProjectStore.get(jobId)
      if (!summary) return

      try {
        const manifestPath = join(summary.downloadPath, 'manifest.json')
        const data = await fs.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

        if (manifest.beats) {
          for (const beat of manifest.beats) {
            const asset = beat.assets?.find((a) => a.id === assetId)
            if (asset && asset.filePath && isPathInside(summary.downloadPath, asset.filePath)) {
              shell.showItemInFolder(asset.filePath)
              return
            }
          }
        }
      } catch (err) {
        console.error('Failed to open asset in folder:', err)
      }
    }
  )

  ipcMain.handle(
    'assets:deleteLocal',
    async (_, rawJobId: unknown, rawAssetId: unknown): Promise<void> => {
      const jobId = JobIdSchema.parse(rawJobId)
      const assetId = AssetIdSchema.parse(rawAssetId)

      // A job with a runner is written by that runner alone, or its next write undoes this.
      const runner = AgentRunner.getActive(jobId)
      if (runner) {
        await runner.deleteLocalAsset(assetId)
        return
      }

      const summary = await ProjectStore.get(jobId)
      if (!summary) return

      try {
        const manifestPath = join(summary.downloadPath, 'manifest.json')
        const data = await fs.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

        let manifestModified = false
        if (manifest.beats) {
          for (const beat of manifest.beats) {
            const asset = beat.assets?.find((a) => a.id === assetId)
            if (asset) {
              if (asset.filePath && isPathInside(summary.downloadPath, asset.filePath)) {
                // A missing file counts as already deleted. Any other failure
                // (permissions, locks) must abort so the manifest keeps the real path.
                await moveFileToTrash(asset.filePath)
              }
              asset.status = 'failed'
              asset.error = 'Deleted by user'
              asset.filePath = undefined
              manifestModified = true
            }
          }
        }

        if (manifestModified) {
          // Save manifest changes through the shared write queue
          await ManifestWriter.writeJsonFile(summary.downloadPath, 'manifest.json', manifest)

          // Recalculate downloaded asset count in project registry
          const activeCount =
            manifest.beats?.flatMap((b) => b.assets || [])?.filter((a) => a.status === 'completed')
              ?.length || 0

          summary.assetCount = activeCount
          await ProjectStore.save(summary)
        }
      } catch (err) {
        console.error('Failed to delete asset locally:', err)
        throw err
      }
    }
  )

  ipcMain.handle('assets:exportManifest', async (_, rawJobId: unknown): Promise<string> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found')

    const manifestPath = join(summary.downloadPath, 'manifest.json')
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as {
      beats?: VisualBeat[]
      attribution?: unknown
      pexelsQuotaSnapshot?: unknown
    }

    const flatAssets =
      manifest.beats?.flatMap((beat) =>
        (beat.assets || []).map((asset) => ({
          id: asset.id,
          type: asset.type,
          pexelsId: asset.pexelsId,
          url: asset.url,
          photographer: asset.photographer,
          photographerUrl: asset.photographerUrl
        }))
      ) || []

    manifest.attribution = buildManifestAttribution(flatAssets)
    manifest.pexelsQuotaSnapshot = PexelsClient.getQuotaSnapshot() || manifest.pexelsQuotaSnapshot

    return JSON.stringify(manifest, null, 2)
  })

  ipcMain.handle('assets:openProjectFolder', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const summary = await ProjectStore.get(jobId)
    if (!summary || !summary.downloadPath) return

    const openError = await shell.openPath(summary.downloadPath)
    if (openError) {
      throw new Error(`Failed to open project folder: ${openError}`)
    }
  })
}
