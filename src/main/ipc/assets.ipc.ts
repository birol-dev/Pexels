import { ipcMain, shell } from 'electron'
import { ProjectStore } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { join } from 'path'

export function registerAssetsHandlers(): void {
  ipcMain.handle('assets:list', async (_, jobId: string) => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) return []

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data)
      
      const assets: any[] = []
      if (manifest.beats) {
        for (const beat of manifest.beats) {
          if (beat.assets) {
            for (const asset of beat.assets) {
              assets.push({
                ...asset,
                beatId: beat.id,
                beatText: beat.text
              })
            }
          }
        }
      }
      return assets
    } catch {
      return []
    }
  })

  ipcMain.handle('assets:openInFolder', async (_, jobId: string, assetId: string) => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) return

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data)

      if (manifest.beats) {
        for (const beat of manifest.beats) {
          const asset = beat.assets?.find((a: any) => a.id === assetId)
          if (asset && asset.filePath) {
            shell.showItemInFolder(asset.filePath)
            return
          }
        }
      }
    } catch (err) {
      console.error('Failed to open asset in folder:', err)
    }
  })

  ipcMain.handle('assets:deleteLocal', async (_, jobId: string, assetId: string) => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) return

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data)

      let fileDeleted = false
      if (manifest.beats) {
        for (const beat of manifest.beats) {
          const asset = beat.assets?.find((a: any) => a.id === assetId)
          if (asset) {
            if (asset.filePath) {
              try {
                await fs.unlink(asset.filePath)
                fileDeleted = true
              } catch (unlinkErr) {
                console.warn('File already deleted or unreachable:', unlinkErr)
              }
            }
            asset.status = 'failed'
            asset.error = 'Deleted by user'
            asset.filePath = undefined
          }
        }
      }

      if (fileDeleted || true) {
        // Save manifest changes
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
        
        // Recalculate downloaded asset count in project registry
        const activeCount = manifest.beats
          ?.flatMap((b: any) => b.assets || [])
          ?.filter((a: any) => a.status === 'completed')?.length || 0
        
        summary.assetCount = activeCount
        await ProjectStore.save(summary)
      }
    } catch (err) {
      console.error('Failed to delete asset locally:', err)
    }
  })

  ipcMain.handle('assets:exportManifest', async (_, jobId: string) => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found')

    const manifestPath = join(summary.downloadPath, 'manifest.json')
    return await fs.readFile(manifestPath, 'utf-8')
  })
}
