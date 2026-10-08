import { toast } from 'sonner'
import { useAppStore } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import type { FlatAsset } from '../types'

interface Params {
  selectedAsset: FlatAsset | null
  setSelectedAsset: (asset: FlatAsset | null) => void
  loadAssets: () => Promise<void>
  loadGroupedAssets: () => Promise<void>
}

export interface LibraryActions {
  openAssetFolder: (assetId: string) => Promise<void>
  deleteAsset: (assetId: string) => Promise<void>
  exportManifest: () => Promise<void>
  openProjectFolder: () => Promise<void>
}

export function useLibraryActions({
  selectedAsset,
  setSelectedAsset,
  loadAssets,
  loadGroupedAssets
}: Params): LibraryActions {
  const activeJobId = useAppStore((s) => s.activeJobId)
  const loadActiveJob = useAppStore((s) => s.loadActiveJob)
  const alert = useAppStore((s) => s.alert)
  const confirm = useAppStore((s) => s.confirm)

  const openAssetFolder = async (assetId: string): Promise<void> => {
    const targetJobId = selectedAsset?.jobId || activeJobId
    if (!targetJobId) return
    await api.assets.openInFolder(targetJobId, assetId)
  }

  const deleteAsset = async (assetId: string): Promise<void> => {
    const targetJobId = selectedAsset?.jobId || activeJobId
    if (!targetJobId) return
    const isConfirmed = await confirm(
      'Delete Asset',
      'Move this file to the trash? You can restore it from there if you change your mind.',
      { confirmText: 'Move to trash' }
    )
    if (!isConfirmed) return
    try {
      await api.assets.deleteLocal(targetJobId, assetId)
      if (activeJobId) {
        await loadAssets()
        await loadActiveJob(activeJobId)
      } else {
        await loadGroupedAssets()
      }
      setSelectedAsset(null)
    } catch (err) {
      await alert(
        'Delete Failed',
        err instanceof Error ? err.message : 'Could not move the asset to the trash.'
      )
    }
  }

  const exportManifest = async (): Promise<void> => {
    if (!activeJobId) return
    try {
      const manifestStr = await api.assets.exportManifest(activeJobId)
      const blob = new Blob([manifestStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `manifest_${activeJobId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('Failed to export manifest: ' + err)
    }
  }

  const openProjectFolder = async (): Promise<void> => {
    if (!activeJobId) return
    try {
      await api.assets.openProjectFolder(activeJobId)
    } catch (err) {
      toast.error('Failed to open project folder: ' + err)
    }
  }

  return { openAssetFolder, deleteAsset, exportManifest, openProjectFolder }
}
