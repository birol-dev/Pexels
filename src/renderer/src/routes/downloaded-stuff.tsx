import React, { useEffect, useState } from 'react'
import { useAppStore } from '../lib/store'
import { api } from '../lib/api-client'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  FolderOpen,
  Trash2,
  Download,
  ExternalLink,
  Info,
  AlertCircle,
  Loader2
} from 'lucide-react'

interface FlatAsset {
  id: string
  pexelsId: number
  type: 'photo' | 'video'
  url: string
  imageUrl: string
  downloadUrl: string
  width: number
  height: number
  duration?: number
  photographer: string
  photographerUrl?: string
  query: string
  filePath?: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  error?: string
  beatId: string
  beatText: string
}

export default function DownloadedStuffView(): React.JSX.Element {
  const { activeJobId, activeJob, navigate, loadActiveJob } = useAppStore()
  const [assets, setAssets] = useState<FlatAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'video' | 'photo' | 'completed' | 'failed'>('all')
  const [selectedAsset, setSelectedAsset] = useState<FlatAsset | null>(null)

  const loadAssets = async () => {
    if (!activeJobId) return
    setLoading(true)
    try {
      const list = await api.assets.list(activeJobId)
      setAssets(list)
      // Reset selection if it doesn't exist anymore or update details
      if (selectedAsset) {
        const updated = list.find((a: any) => a.id === selectedAsset.id)
        setSelectedAsset(updated || null)
      }
    } catch (err) {
      console.error('Failed to load assets:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [activeJobId, activeJob?.downloadedCount, activeJob?.failedCount])

  if (!activeJobId) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-bold">No Workspace Active</h2>
          <p className="text-sm text-muted-foreground">
            Select a running or completed project from history to inspect downloaded files.
          </p>
        </div>
        <Button onClick={() => navigate('input')}>Back to Dashboard</Button>
      </div>
    )
  }

  const handleOpenFolder = async (assetId: string) => {
    await api.assets.openInFolder(activeJobId, assetId)
  }

  const handleDelete = async (assetId: string) => {
    if (confirm('Are you sure you want to delete this file from local storage?')) {
      await api.assets.deleteLocal(activeJobId, assetId)
      await loadAssets()
      await loadActiveJob(activeJobId)
    }
  }

  const handleExportManifest = async () => {
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
      alert('Failed to export manifest: ' + err)
    }
  }

  const filteredAssets = assets.filter((asset) => {
    if (filter === 'all') return true
    if (filter === 'video') return asset.type === 'video'
    if (filter === 'photo') return asset.type === 'photo'
    if (filter === 'completed') return asset.status === 'completed'
    if (filter === 'failed') return asset.status === 'failed'
    return true
  })

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Downloaded Stock Assets</h1>
          <p className="text-sm text-muted-foreground">Project: {activeJob?.title}</p>
        </div>

        <Button
          size="sm"
          onClick={handleExportManifest}
          className="bg-white/10 hover:bg-white/20 border border-white/5 text-white"
        >
          <Download className="h-4 w-4 mr-1.5" />
          Export Project Manifest
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Assets Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <Tabs value={filter} onValueChange={(val: any) => setFilter(val)} className="w-auto">
              <TabsList className="bg-black/40 border border-white/5">
                <TabsTrigger value="all">All ({assets.length})</TabsTrigger>
                <TabsTrigger value="video">
                  Videos ({assets.filter((a) => a.type === 'video').length})
                </TabsTrigger>
                <TabsTrigger value="photo">
                  Photos ({assets.filter((a) => a.type === 'photo').length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Downloaded ({assets.filter((a) => a.status === 'completed').length})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed ({assets.filter((a) => a.status === 'failed').length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center text-muted-foreground text-sm">
              No matching assets found in this project.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`glass-card rounded-xl overflow-hidden border transition-all cursor-pointer aspect-video relative group ${selectedAsset?.id === asset.id ? 'border-primary ring-2 ring-primary/20' : 'border-white/5'}`}
                >
                  <img
                    src={asset.imageUrl}
                    className="w-full h-full object-cover"
                    alt="Stock Thumbnail"
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col justify-between p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] uppercase font-bold text-white tracking-wider">
                      {asset.type}
                    </span>
                    <div className="flex justify-between items-center text-[10px] font-mono text-neutral-200">
                      <span className="truncate max-w-[100px]">By {asset.photographer}</span>
                      {asset.status === 'completed' && (
                        <Badge className="bg-emerald-600 text-white text-[8px] h-4 py-0">
                          Ready
                        </Badge>
                      )}
                      {asset.status === 'failed' && (
                        <Badge variant="destructive" className="text-[8px] h-4 py-0">
                          Failed
                        </Badge>
                      )}
                      {asset.status === 'downloading' && (
                        <Badge className="bg-blue-600 text-white text-[8px] h-4 py-0">
                          Downloading
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Status indicator on thumbnail when not hovered */}
                  <div className="absolute bottom-2 right-2 group-hover:hidden">
                    {asset.status === 'completed' && (
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50" />
                    )}
                    {asset.status === 'failed' && (
                      <div className="h-2 w-2 rounded-full bg-red-500 shadow-md shadow-red-500/50" />
                    )}
                    {asset.status === 'downloading' && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 shadow-md shadow-blue-500/50 animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details Panel */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 pb-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold tracking-tight">Asset Inspector</h2>
          </div>

          {!selectedAsset ? (
            <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground text-sm">
              Click any asset in the grid to inspect details, path locations, and creator licensing.
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-5 space-y-4">
              {/* Media Preview (Video player or Image Preview) */}
              <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10 bg-black flex items-center justify-center">
                {selectedAsset.status === 'completed' && selectedAsset.filePath ? (
                  selectedAsset.type === 'video' ? (
                    <video
                      key={selectedAsset.filePath}
                      src={`media://${selectedAsset.filePath}`}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={`media://${selectedAsset.filePath}`}
                      className="w-full h-full object-contain"
                      alt="Local Stock Preview"
                    />
                  )
                ) : (
                  <img
                    src={selectedAsset.imageUrl}
                    className="w-full h-full object-cover opacity-60 filter blur-xs"
                    alt="Stock Preview"
                  />
                )}
                {selectedAsset.status !== 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-mono">
                    {selectedAsset.status === 'downloading'
                      ? 'Asset is downloading...'
                      : 'Download failed or user deleted'}
                  </div>
                )}
              </div>

              {/* Asset Metadata */}
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                    Original Source
                  </span>
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center mt-0.5"
                  >
                    View on Pexels
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>

                <div>
                  <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                    Photographer / Creator
                  </span>
                  <div className="font-semibold text-white mt-0.5">
                    {selectedAsset.photographer}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                      Dimensions
                    </span>
                    <div className="text-white mt-0.5">
                      {selectedAsset.width} × {selectedAsset.height} px
                    </div>
                  </div>
                  {selectedAsset.type === 'video' && selectedAsset.duration !== undefined && (
                    <div>
                      <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                        Duration
                      </span>
                      <div className="text-white mt-0.5">{selectedAsset.duration} seconds</div>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                    Stock Query Used
                  </span>
                  <div className="text-white font-mono mt-0.5">"{selectedAsset.query}"</div>
                </div>

                <div>
                  <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                    Script Beat Context
                  </span>
                  <div className="text-neutral-300 italic leading-relaxed mt-1 bg-black/10 border border-white/5 rounded p-2 text-[11px]">
                    "{selectedAsset.beatText}"
                  </div>
                </div>

                {selectedAsset.filePath && (
                  <div>
                    <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                      Local Disk Path
                    </span>
                    <div className="text-neutral-400 font-mono select-all break-all leading-normal mt-0.5 text-[10px] bg-black/25 p-2 rounded border border-white/5">
                      {selectedAsset.filePath}
                    </div>
                  </div>
                )}

                {selectedAsset.error && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive-foreground rounded-lg">
                    <span className="font-semibold block mb-0.5">Download Error:</span>
                    {selectedAsset.error}
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground uppercase text-[9px] font-mono block">
                    Licensing Note
                  </span>
                  <div className="text-emerald-400 font-medium mt-0.5">
                    Free to use under the Pexels License.
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {selectedAsset.status === 'completed' && (
                <div className="flex gap-2 border-t border-white/5 pt-4">
                  <Button
                    onClick={() => handleOpenFolder(selectedAsset.id)}
                    className="flex-1 bg-white/10 hover:bg-white/20 border border-white/5 text-white"
                  >
                    <FolderOpen className="h-4 w-4 mr-1.5" />
                    Open Location
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedAsset.id)}
                    className="shrink-0"
                    title="Delete File"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
