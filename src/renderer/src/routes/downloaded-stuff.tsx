import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../lib/store'
import { api } from '../lib/api-client'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'video' | 'photo' | 'completed' | 'failed'>('all')
  const [selectedAsset, setSelectedAsset] = useState<FlatAsset | null>(null)

  const loadAssets = useCallback(async (): Promise<void> => {
    if (!activeJobId) return
    setLoading(true)
    try {
      const list = (await api.assets.list(activeJobId)) as unknown as FlatAsset[]
      setAssets(list)
      if (selectedAsset) {
        const updated = list.find((a: FlatAsset) => a.id === selectedAsset.id)
        setSelectedAsset(updated || null)
      }
    } catch (err) {
      console.error('Failed to load assets:', err)
    } finally {
      setLoading(false)
    }
  }, [activeJobId, selectedAsset])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadAssets()
    })
  }, [activeJobId, activeJob?.downloadedCount, activeJob?.failedCount, loadAssets])

  if (!activeJobId) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4 animate-fade-in-up">
        <span className="material-symbols-outlined text-[48px] text-outline">perm_media</span>
        <div>
          <h2 className="text-xl font-bold">No Workspace Active</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Select a running or completed project from history to inspect downloaded files.
          </p>
        </div>
        <button
          onClick={() => navigate('input')}
          className="tactile-button px-6 py-2.5 rounded-lg text-xs font-semibold shadow-md cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const handleOpenFolder = async (assetId: string): Promise<void> => {
    await api.assets.openInFolder(activeJobId, assetId)
  }

  const handleDelete = async (assetId: string): Promise<void> => {
    if (confirm('Are you sure you want to delete this file from local storage?')) {
      await api.assets.deleteLocal(activeJobId, assetId)
      await loadAssets()
      await loadActiveJob(activeJobId)
    }
  }

  const handleExportManifest = async (): Promise<void> => {
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
    // Search filter
    const matchesSearch =
      (asset.photographer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.query || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.beatText || '').toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    // Tabs filter
    if (filter === 'all') return true
    if (filter === 'video') return asset.type === 'video'
    if (filter === 'photo') return asset.type === 'photo'
    if (filter === 'completed') return asset.status === 'completed'
    if (filter === 'failed') return asset.status === 'failed'
    return true
  })

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in-up">
      {/* Top Header Filter Bar */}
      <header className="glass-panel w-full px-6 py-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-0 z-40">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface">Media Library</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Project: {activeJob?.title}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative grow sm:grow-0">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-10 pr-4 py-2 rounded-full text-xs font-semibold w-full sm:w-56"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex bg-white/40 p-1 rounded-lg border border-white/50 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                filter === 'all'
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('video')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                filter === 'video'
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => setFilter('photo')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                filter === 'photo'
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Photos
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={filter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setFilter(e.target.value as 'all' | 'video' | 'photo' | 'completed' | 'failed')
            }
            className="glass-input px-4 py-2 rounded-lg text-xs font-semibold appearance-none pr-10 cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23414755%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")`,
              backgroundSize: '14px',
              backgroundPosition: 'right 10px center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            <option value="all">Status: All</option>
            <option value="completed">Downloaded</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={handleExportManifest}
            className="btn-interactive px-4 py-2 bg-white/60 border border-outline-variant hover:bg-white text-on-surface rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">download</span> Export Manifest
          </button>
        </div>
      </header>

      {/* Main Grid & Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Assets Grid */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex h-[300px] items-center justify-center bg-transparent">
              <span className="material-symbols-outlined text-[48px] text-primary animate-spin">
                sync
              </span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-xs text-on-surface-variant font-medium">
              No matching assets found in this project workspace.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`glass-panel rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg relative aspect-video group ${
                    selectedAsset?.id === asset.id
                      ? 'ring-2 ring-primary border-primary'
                      : 'border-white/50'
                  }`}
                >
                  <img
                    src={asset.imageUrl}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    alt="Asset thumbnail"
                  />

                  {/* Play icon overlay for videos */}
                  {asset.type === 'video' && asset.status === 'completed' && (
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center transition-opacity hover:bg-black/25">
                      <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center border border-white/50 text-white shadow-md">
                        <span
                          className="material-symbols-outlined text-[24px] ml-0.5"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          play_arrow
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Type badge on thumbnail top-left */}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2 py-0.5 bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant/30 rounded font-mono text-[9px] text-on-surface shadow-sm flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">
                        {asset.type === 'video' ? 'videocam' : 'image'}
                      </span>
                      {asset.type === 'video' ? '4K' : 'IMG'}
                    </span>
                  </div>

                  {/* Status badge top-right */}
                  <div className="absolute top-2.5 right-2.5">
                    {asset.status === 'completed' ? (
                      <span className="px-1.5 py-0.5 bg-secondary-container border border-secondary/20 rounded font-mono text-[9px] text-on-secondary-container uppercase shadow-sm">
                        Ready
                      </span>
                    ) : asset.status === 'failed' ? (
                      <span className="px-1.5 py-0.5 bg-error-container border border-error/20 rounded font-mono text-[9px] text-on-error-container uppercase shadow-sm">
                        Failed
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-primary-fixed border border-primary/20 rounded font-mono text-[9px] text-primary uppercase shadow-sm animate-pulse-glow">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Info Hover details */}
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/30 to-transparent p-2 text-[9px]">
                    <h4 className="text-white font-semibold truncate leading-tight">
                      {asset.filePath
                        ? asset.filePath.split(/[\\/]/).pop()
                        : `${asset.type}_${asset.pexelsId}`}
                    </h4>
                    <div className="flex justify-between items-center text-neutral-300 font-mono text-[8px] mt-0.5 leading-none">
                      <span>
                        Pexels • {asset.width}x{asset.height}
                      </span>
                      <span>By {asset.photographer}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details Panel (Inspector) */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 pb-2">
            <span className="material-symbols-outlined text-outline text-[20px]">info</span>
            <h2 className="text-xl font-bold tracking-tight text-on-surface">Asset Inspector</h2>
          </div>

          {!selectedAsset ? (
            <div className="glass-panel rounded-2xl p-6 text-center text-xs text-on-surface-variant font-medium">
              Select any asset in the library grid to inspect file coordinates, creator licensing,
              and run local playback.
            </div>
          ) : (
            <div className="glass-panel-elevated rounded-2xl overflow-hidden flex flex-col relative animate-fade-in-up">
              {/* Media Preview Player */}
              <div className="w-full aspect-video bg-black flex items-center justify-center relative group">
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
                  <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container opacity-60">
                    <span className="material-symbols-outlined text-[36px] text-outline">
                      broken_image
                    </span>
                    <span className="text-[10px] font-mono mt-1 text-on-surface-variant">
                      {selectedAsset.status === 'downloading'
                        ? 'File is downloading...'
                        : 'Local file missing'}
                    </span>
                  </div>
                )}
              </div>

              {/* Metadata content */}
              <div className="p-5 space-y-4 text-xs font-semibold text-on-surface-variant">
                <div>
                  <span className="text-outline uppercase text-[9px] font-mono block mb-0.5">
                    Original Source
                  </span>
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 mt-0.5"
                  >
                    View on Pexels
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>

                <div className="h-px w-full bg-black/4" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-outline uppercase text-[9px] font-mono block">
                      Creator
                    </span>
                    <p className="text-on-surface mt-0.5 truncate">{selectedAsset.photographer}</p>
                  </div>
                  <div>
                    <span className="text-outline uppercase text-[9px] font-mono block">
                      Resolution
                    </span>
                    <p className="text-on-surface mt-0.5">
                      {selectedAsset.width} × {selectedAsset.height}
                    </p>
                  </div>
                  {selectedAsset.duration !== undefined && (
                    <div>
                      <span className="text-outline uppercase text-[9px] font-mono block">
                        Duration
                      </span>
                      <p className="text-on-surface mt-0.5">{selectedAsset.duration}s</p>
                    </div>
                  )}
                  <div>
                    <span className="text-outline uppercase text-[9px] font-mono block">Type</span>
                    <p className="text-on-surface mt-0.5 capitalize">{selectedAsset.type}</p>
                  </div>
                </div>

                <div className="h-px w-full bg-black/4" />

                <div>
                  <span className="text-outline uppercase text-[9px] font-mono block">
                    Search Query Context
                  </span>
                  <p className="text-on-surface font-mono mt-1 italic text-[11px]">
                    &ldquo;{selectedAsset.query}&rdquo;
                  </p>
                </div>

                <div>
                  <span className="text-outline uppercase text-[9px] font-mono block">
                    Script beat segment
                  </span>
                  <p className="text-on-surface italic leading-relaxed mt-1 bg-surface-container-low border border-white/60 p-2.5 rounded text-[11px]">
                    &ldquo;{selectedAsset.beatText}&rdquo;
                  </p>
                </div>

                {selectedAsset.filePath && (
                  <div>
                    <span className="text-outline uppercase text-[9px] font-mono block">
                      Local Disk Path
                    </span>
                    <p className="text-on-surface-variant font-mono select-all break-all leading-normal mt-1 text-[10px] bg-black/3 p-2.5 rounded border border-black/4">
                      {selectedAsset.filePath}
                    </p>
                  </div>
                )}

                {selectedAsset.error && (
                  <div className="p-3 bg-error-container border border-error/20 text-on-error-container rounded-lg text-[10px] font-medium leading-normal">
                    <span className="font-bold block mb-0.5">Download Error:</span>
                    {selectedAsset.error}
                  </div>
                )}
              </div>

              {/* Action buttons pinned */}
              {selectedAsset.status === 'completed' && (
                <div className="p-4 border-t border-black/4 bg-white/20 flex gap-2">
                  <button
                    onClick={() => handleOpenFolder(selectedAsset.id)}
                    className="btn-interactive grow py-2.5 rounded-lg bg-white hover:bg-surface-container-high border border-outline-variant/60 font-semibold text-xs text-on-surface transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>{' '}
                    Reveal in Folder
                  </button>
                  <button
                    onClick={() => handleDelete(selectedAsset.id)}
                    className="btn-interactive py-2.5 px-3 rounded-lg hover:bg-error-container hover:text-error text-on-surface-variant font-semibold text-xs flex items-center justify-center transition-colors"
                    title="Delete Asset"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
