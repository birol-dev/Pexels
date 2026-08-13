import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../lib/store'
import { api } from '../lib/api-client'
import { toMediaUrl } from '../lib/media-url'

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
  jobId?: string
}

interface GroupedProject {
  jobId: string
  title: string
  assets: FlatAsset[]
}

function pexelsAssetPageUrl(type: 'photo' | 'video', pexelsId: number): string {
  return type === 'photo'
    ? `https://www.pexels.com/photo/${pexelsId}/`
    : `https://www.pexels.com/video/${pexelsId}/`
}

function buildCreditLine(asset: FlatAsset): string {
  const label = asset.type === 'photo' ? 'Photo' : 'Video'
  return `${label} by ${asset.photographer} on Pexels`
}

const ATTRIBUTION_BANNER_KEY = 'stockfinder:attribution-banner-dismissed'

export default function DownloadedStuffView(): React.JSX.Element {
  const {
    activeJobId,
    activeJob,
    navigate,
    loadActiveJob,
    alert,
    confirm,
    loadJobs,
    setActiveJobId,
    openTab
  } = useAppStore()
  const [assets, setAssets] = useState<FlatAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'video' | 'photo' | 'completed' | 'failed'>('all')
  const [selectedAsset, setSelectedAsset] = useState<FlatAsset | null>(null)
  const selectedAssetRef = useRef<FlatAsset | null>(null)
  // Keep ref in sync so loadAssets can read latest without being a render dependency
  useEffect(() => {
    selectedAssetRef.current = selectedAsset
  }, [selectedAsset])

  const [groupedProjects, setGroupedProjects] = useState<GroupedProject[]>([])
  const [groupedLoading, setGroupedLoading] = useState(false)
  const [attributionBannerVisible, setAttributionBannerVisible] = useState(
    () => localStorage.getItem(ATTRIBUTION_BANNER_KEY) !== 'true'
  )

  const dismissAttributionBanner = (): void => {
    localStorage.setItem(ATTRIBUTION_BANNER_KEY, 'true')
    setAttributionBannerVisible(false)
  }

  const loadAssets = useCallback(async (): Promise<void> => {
    if (!activeJobId) return
    const requestedJobId = activeJobId
    setLoading(true)
    try {
      const list = (await api.assets.list(requestedJobId)) as unknown as FlatAsset[]
      if (useAppStore.getState().activeJobId !== requestedJobId) {
        return
      }
      setAssets(list)
      if (selectedAssetRef.current) {
        const updated = list.find((a: FlatAsset) => a.id === selectedAssetRef.current!.id)
        setSelectedAsset(updated || null)
      }
    } catch (err) {
      console.error('Failed to load assets:', err)
    } finally {
      if (useAppStore.getState().activeJobId === requestedJobId) {
        setLoading(false)
      }
    }
  }, [activeJobId])

  const loadGroupedAssets = useCallback(async (): Promise<void> => {
    setGroupedLoading(true)
    try {
      await loadJobs()
      const currentJobs = useAppStore.getState().jobs
      const results: GroupedProject[] = []

      await Promise.all(
        currentJobs.map(async (job) => {
          try {
            const list = (await api.assets.list(job.jobId)) as unknown as FlatAsset[]
            const completed = list
              .filter((a) => a.status === 'completed')
              .map((a) => ({ ...a, jobId: job.jobId }))
            if (completed.length > 0) {
              results.push({
                jobId: job.jobId,
                title: job.title,
                assets: completed
              })
            }
          } catch (err) {
            console.error(`Failed to load assets for job ${job.jobId}:`, err)
          }
        })
      )

      results.sort((a, b) => {
        const indexA = currentJobs.findIndex((j) => j.jobId === a.jobId)
        const indexB = currentJobs.findIndex((j) => j.jobId === b.jobId)
        return indexA - indexB
      })

      setGroupedProjects(results)
    } catch (err) {
      console.error('Failed to load grouped assets:', err)
    } finally {
      setGroupedLoading(false)
    }
  }, [loadJobs])

  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedAsset(null)
      selectedAssetRef.current = null
      setAssets([])
      loadAssets()
    })
  }, [activeJobId, activeJob?.downloadedCount, activeJob?.failedCount, loadAssets])

  useEffect(() => {
    if (!activeJobId) {
      Promise.resolve().then(() => {
        loadGroupedAssets()
      })
    }
  }, [activeJobId, loadGroupedAssets])

  const handleOpenFolder = async (assetId: string): Promise<void> => {
    const targetJobId = selectedAsset?.jobId || activeJobId
    if (!targetJobId) return
    await api.assets.openInFolder(targetJobId, assetId)
  }

  const handleDelete = async (assetId: string): Promise<void> => {
    const targetJobId = selectedAsset?.jobId || activeJobId
    if (!targetJobId) return
    const isConfirmed = await confirm(
      'Delete Asset',
      'Are you sure you want to delete this file from local storage?'
    )
    if (isConfirmed) {
      await api.assets.deleteLocal(targetJobId, assetId)
      if (activeJobId) {
        await loadAssets()
        await loadActiveJob(activeJobId)
      } else {
        await loadGroupedAssets()
      }
      setSelectedAsset(null)
    }
  }

  const handleExportManifest = async (): Promise<void> => {
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
      await alert('Export Error', 'Failed to export manifest: ' + err)
    }
  }

  const handleOpenProjectFolder = async (): Promise<void> => {
    if (!activeJobId) return
    try {
      await api.assets.openProjectFolder(activeJobId)
    } catch (err) {
      await alert('Navigation Error', 'Failed to open project folder: ' + err)
    }
  }

  const renderAssetCard = (asset: FlatAsset): React.JSX.Element => {
    const isSelected = selectedAsset?.id === asset.id
    const filename = asset.filePath
      ? asset.filePath.split(/[\\/]/).pop()
      : `${asset.type}_${asset.pexelsId}`
    const durationStr = asset.duration
      ? asset.duration < 10
        ? `00:0${asset.duration}`
        : `00:${asset.duration}`
      : ''

    return (
      <div
        key={asset.id}
        onClick={() => setSelectedAsset(asset)}
        className={`group bg-surface border-2 border-ink-black rounded-xl shadow-outset-soft hover:shadow-hard hover:scale-[1.01] transition-all duration-300 flex flex-col overflow-hidden relative cursor-pointer h-[320px] ${
          isSelected ? 'ring-4 ring-electric-purple' : ''
        }`}
      >
        {/* Status Badge */}
        <div className="absolute top-3 left-3 z-10">
          {asset.status === 'completed' ? (
            <div className="bg-cyber-lime border-2 border-ink-black px-2 py-1 rounded-full shadow-[2px_2px_0px_#18181B] flex items-center gap-1">
              <span className="font-label-sm text-[10px] uppercase font-bold text-ink-black tracking-widest">
                Ready
              </span>
            </div>
          ) : asset.status === 'failed' ? (
            <div className="bg-error-container border-2 border-ink-black px-2 py-1 rounded-full shadow-[2px_2px_0px_#18181B] flex items-center gap-1">
              <span className="font-label-sm text-[10px] uppercase font-bold text-on-error-container tracking-widest">
                Failed
              </span>
            </div>
          ) : (
            <div className="bg-surface-variant border-2 border-ink-black px-2 py-1 rounded-full shadow-[2px_2px_0px_#18181B] flex items-center gap-1 animate-pulse">
              <span className="font-label-sm text-[10px] uppercase font-bold text-ink-black tracking-widest">
                Active
              </span>
            </div>
          )}
        </div>

        {/* Thumbnail Image Container */}
        <div className="h-48 w-full border-b-2 border-ink-black relative overflow-hidden bg-ink-black">
          <img
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100 mix-blend-luminosity hover:mix-blend-normal"
            src={asset.imageUrl}
            alt={filename}
          />
          <div className="absolute inset-0 bg-linear-to-t from-ink-black/60 to-transparent"></div>
          {durationStr && (
            <span className="absolute bottom-2 right-2 text-paper-white bg-ink-black/80 px-2 py-0.5 rounded text-[10px] font-label-sm border border-paper-white/20">
              {durationStr}
            </span>
          )}
        </div>

        {/* Card Info */}
        <div className="p-4 flex flex-col flex-1 justify-between bg-paper-white">
          <div>
            <h3 className="font-title-md text-[16px] text-ink-black truncate leading-tight font-bold">
              {filename}
            </h3>
            <p className="font-body-md text-[12px] text-risograph-gray mt-1">
              {asset.width}x{asset.height} • {asset.type.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-surface-variant border-dashed gap-2">
            <a
              href={asset.photographerUrl || pexelsAssetPageUrl(asset.type, asset.pexelsId)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-label-sm text-[11px] text-risograph-gray uppercase tracking-wider truncate hover:text-electric-purple hover:underline"
            >
              {buildCreditLine(asset)}
            </a>
            <span className="material-symbols-outlined text-[16px] text-ink-black shrink-0">
              info
            </span>
          </div>
        </div>
      </div>
    )
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

  const filteredGroupedProjects = groupedProjects
    .map((project) => {
      const filtered = project.assets.filter((asset) => {
        const matchesSearch =
          (asset.photographer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (asset.query || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (asset.beatText || '').toLowerCase().includes(searchQuery.toLowerCase())

        if (!matchesSearch) return false

        if (filter === 'all') return true
        if (filter === 'video') return asset.type === 'video'
        if (filter === 'photo') return asset.type === 'photo'
        return true
      })
      return {
        ...project,
        assets: filtered
      }
    })
    .filter((project) => project.assets.length > 0)

  if (!activeJobId) {
    if (groupedProjects.length === 0 && !groupedLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4 animate-fade-in-up">
          <span className="material-symbols-outlined text-[48px] text-outline">perm_media</span>
          <div>
            <h2 className="text-xl font-bold text-ink-black uppercase">No Workspace Active</h2>
            <p className="text-sm text-risograph-gray mt-1">
              Select a running or completed project from history to inspect downloaded files.
            </p>
          </div>
          <button
            onClick={() => navigate('input')}
            className="btn-primary px-6 py-2.5 rounded-DEFAULT text-xs font-semibold uppercase tracking-wider"
          >
            Back to Dashboard
          </button>
        </div>
      )
    }
  }

  const currentTitle = activeJobId ? activeJob?.title || 'test' : 'Media Library'

  return (
    <div className="w-full max-w-[1280px] mx-auto px-grid-margin py-8 flex flex-col gap-8 relative z-10 animate-fade-in-up">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-ink-black pb-6">
        <div className="flex flex-col">
          <h2 className="text-headline-lg font-headline-lg text-ink-black tracking-tight leading-none uppercase">
            Media Library
          </h2>
          <span className="text-body-md font-body-md text-risograph-gray mt-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">account_tree</span>
            {activeJobId ? (
              <>
                Project:{' '}
                <strong className="text-ink-black border-b-2 border-cyber-lime">
                  {currentTitle}
                </strong>
              </>
            ) : (
              'All Projects Downloads'
            )}
          </span>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Query Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-risograph-gray text-[18px]">
                search
              </span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-surface shadow-inset-soft border-2 border-ink-black rounded-DEFAULT text-body-md font-body-md focus:outline-none focus:ring-2 focus:ring-electric-purple w-64 placeholder-risograph-gray text-ink-black"
              placeholder="Search assets..."
            />
            <span className="absolute -top-3 left-4 bg-background px-1 text-[10px] font-label-sm uppercase tracking-widest text-ink-black">
              Query
            </span>
          </div>

          {activeJobId && (
            <>
              <button
                onClick={handleOpenProjectFolder}
                className="btn-secondary rounded-DEFAULT px-4 py-2 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                <span className="font-label-sm text-xs uppercase tracking-wide">Open Folder</span>
              </button>
              <button
                onClick={handleExportManifest}
                className="btn-primary rounded-DEFAULT px-4 py-2 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span className="font-label-sm text-xs uppercase tracking-wide">
                  Export Manifest
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      {attributionBannerVisible && (
        <section className="px-6 py-4 border-2 border-ink-black bg-cyber-lime/20 rounded-DEFAULT flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-ink-black">
            <span className="font-bold">Attribution required.</span> Credit photographers and link
            back to{' '}
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold hover:text-electric-purple"
            >
              Pexels
            </a>{' '}
            when you publish or export these assets.
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://www.pexels.com/api/documentation/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-label-sm uppercase tracking-wide text-ink-black underline hover:text-electric-purple"
            >
              Pexels API guidelines
            </a>
            <button
              type="button"
              onClick={dismissAttributionBanner}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-ink-black/10 hover:text-error transition-colors text-ink-black cursor-pointer"
              title="Dismiss reminder"
              aria-label="Dismiss attribution reminder"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </section>
      )}

      {/* Filter Options Bar */}
      <div className="px-6 py-4 border-2 border-ink-black bg-surface-container-low rounded-DEFAULT flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Segmented Control */}
          <div className="flex p-1 bg-surface shadow-inset-soft border-2 border-ink-black rounded-DEFAULT">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-sm font-label-sm text-xs uppercase transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-ink-black text-cyber-lime font-bold shadow-hard'
                  : 'text-on-surface-variant hover:text-ink-black'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('video')}
              className={`px-4 py-1.5 rounded-sm font-label-sm text-xs uppercase transition-all cursor-pointer ${
                filter === 'video'
                  ? 'bg-ink-black text-cyber-lime font-bold shadow-hard'
                  : 'text-on-surface-variant hover:text-ink-black'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => setFilter('photo')}
              className={`px-4 py-1.5 rounded-sm font-label-sm text-xs uppercase transition-all cursor-pointer ${
                filter === 'photo'
                  ? 'bg-ink-black text-cyber-lime font-bold shadow-hard'
                  : 'text-on-surface-variant hover:text-ink-black'
              }`}
            >
              Photos
            </button>
          </div>

          {/* Status Dropdown Filter (only when viewing single project) */}
          {activeJobId && (
            <div className="relative">
              <select
                value={filter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilter(e.target.value as 'all' | 'video' | 'photo' | 'completed' | 'failed')
                }
                className="neo-input appearance-none rounded-DEFAULT px-4 py-2 pr-10 font-body-md text-sm outline-none focus:border-electric-purple transition-colors cursor-pointer bg-surface text-ink-black"
              >
                <option value="all">Status: All</option>
                <option value="completed">Downloaded</option>
                <option value="failed">Failed</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-black text-[18px]">
                expand_more
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid & Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Assets Pane */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {!activeJobId ? (
            groupedLoading ? (
              <div className="flex h-[300px] items-center justify-center bg-transparent">
                <span className="material-symbols-outlined text-[48px] text-cyber-lime animate-spin">
                  sync
                </span>
              </div>
            ) : filteredGroupedProjects.length === 0 ? (
              <div className="bento-card p-12 text-center font-body-md text-risograph-gray">
                No matching assets found in any project workspace.
              </div>
            ) : (
              filteredGroupedProjects.map((project) => (
                <div key={project.jobId} className="bento-card p-6 flex flex-col gap-6">
                  <div className="flex justify-between items-center border-b-2 border-ink-black pb-4">
                    <div>
                      <h3 className="font-title-md text-[18px] text-ink-black uppercase leading-tight font-bold">
                        {project.title}
                      </h3>
                      <p className="font-mono text-[10px] text-risograph-gray mt-1">
                        Project ID: {project.jobId}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setActiveJobId(project.jobId)
                          openTab('stuff', project.jobId)
                        }}
                        className="btn-primary rounded-DEFAULT px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span className="font-label-sm text-xs uppercase">Inspect Project</span>
                      </button>
                      <button
                        onClick={() => api.assets.openProjectFolder(project.jobId)}
                        className="btn-secondary rounded-DEFAULT px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">folder</span>
                        <span className="font-label-sm text-xs uppercase">Open Folder</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {project.assets.map((asset) => renderAssetCard(asset))}
                  </div>
                </div>
              ))
            )
          ) : loading ? (
            <div className="flex h-[300px] items-center justify-center bg-transparent">
              <span className="material-symbols-outlined text-[48px] text-cyber-lime animate-spin">
                sync
              </span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="bento-card p-12 text-center font-body-md text-risograph-gray">
              No matching assets found in this project workspace.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredAssets.map((asset) => renderAssetCard(asset))}
            </div>
          )}
        </div>

        {/* Right Asset Inspector Pane */}
        <aside className="lg:col-span-4 bento-card flex flex-col overflow-hidden bg-surface">
          <div className="p-4 border-b-2 border-ink-black bg-ink-black text-cyber-lime flex items-center gap-2">
            <span className="material-symbols-outlined">troubleshoot</span>
            <h3 className="font-title-md text-[18px] tracking-wide uppercase font-bold">
              Asset Inspector
            </h3>
          </div>

          {!selectedAsset ? (
            <div className="p-8 flex flex-col items-center justify-center text-center opacity-65 min-h-[300px]">
              <div className="w-16 h-16 border-2 border-ink-black rounded-full shadow-inset-soft bg-paper-white flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[32px] text-ink-black">
                  touch_app
                </span>
              </div>
              <h4 className="font-title-md text-ink-black text-[18px] mb-2 uppercase">
                No Asset Selected
              </h4>
              <p className="font-body-md text-risograph-gray text-[14px]">
                Select an asset from the library grid to inspect detailed spatial coordinates,
                metadata, and licensing status.
              </p>
            </div>
          ) : (
            <div className="flex flex-col animate-fade-in-up">
              {/* Media Preview Player */}
              <div className="w-full aspect-video bg-ink-black flex items-center justify-center relative overflow-hidden border-b-2 border-ink-black">
                {selectedAsset.status === 'completed' && selectedAsset.filePath ? (
                  selectedAsset.type === 'video' ? (
                    <video
                      key={selectedAsset.filePath}
                      src={toMediaUrl(selectedAsset.filePath)}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={toMediaUrl(selectedAsset.filePath)}
                      className="w-full h-full object-contain"
                      alt="Local Stock Preview"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container opacity-60">
                    <span className="material-symbols-outlined text-[36px] text-risograph-gray">
                      broken_image
                    </span>
                    <span className="text-[10px] font-mono mt-1 text-risograph-gray font-bold">
                      {selectedAsset.status === 'downloading'
                        ? 'File is downloading...'
                        : 'Local file missing'}
                    </span>
                  </div>
                )}
              </div>

              {/* Metadata content */}
              <div className="p-5 flex flex-col gap-4 text-xs font-semibold text-on-surface-variant">
                <div>
                  <span className="text-risograph-gray uppercase text-[9px] font-mono block mb-0.5">
                    Pexels Attribution
                  </span>
                  <p className="text-ink-black text-[11px] font-semibold mt-0.5">
                    {buildCreditLine(selectedAsset)}
                  </p>
                  <div className="flex flex-col gap-1 mt-2">
                    <a
                      href={pexelsAssetPageUrl(selectedAsset.type, selectedAsset.pexelsId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-electric-purple hover:underline flex items-center gap-1 text-[11px] font-bold"
                    >
                      View asset on Pexels
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                    {selectedAsset.photographerUrl && (
                      <a
                        href={selectedAsset.photographerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-electric-purple hover:underline flex items-center gap-1 text-[11px] font-bold"
                      >
                        View photographer profile
                        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      </a>
                    )}
                    <a
                      href="https://www.pexels.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-electric-purple hover:underline flex items-center gap-1 text-[11px] font-bold"
                    >
                      Photos and videos provided by Pexels
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  </div>
                </div>

                <div className="h-px w-full bg-ink-black/10 border-t border-dashed border-ink-black" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                      Creator
                    </span>
                    <p className="text-ink-black mt-0.5 font-bold truncate">
                      {selectedAsset.photographer}
                    </p>
                  </div>
                  <div>
                    <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                      Resolution
                    </span>
                    <p className="text-ink-black mt-0.5 font-bold">
                      {selectedAsset.width} × {selectedAsset.height}
                    </p>
                  </div>
                  {selectedAsset.duration !== undefined && (
                    <div>
                      <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                        Duration
                      </span>
                      <p className="text-ink-black mt-0.5 font-bold">{selectedAsset.duration}s</p>
                    </div>
                  )}
                  <div>
                    <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                      Type
                    </span>
                    <p className="text-ink-black mt-0.5 font-bold capitalize">
                      {selectedAsset.type}
                    </p>
                  </div>
                </div>

                <div className="h-px w-full bg-ink-black/10 border-t border-dashed border-ink-black" />

                <div>
                  <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                    Search Query Context
                  </span>
                  <p className="text-ink-black font-mono mt-1 italic text-[11px] font-bold">
                    &ldquo;{selectedAsset.query}&rdquo;
                  </p>
                </div>

                <div>
                  <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                    Script beat segment
                  </span>
                  <p className="text-ink-black italic leading-relaxed mt-1 bg-surface-container-low p-2.5 rounded border border-ink-black/10 text-[11px]">
                    &ldquo;{selectedAsset.beatText}&rdquo;
                  </p>
                </div>

                {selectedAsset.filePath && (
                  <div>
                    <span className="text-risograph-gray uppercase text-[9px] font-mono block">
                      Local Disk Path
                    </span>
                    <p className="text-risograph-gray font-mono select-all break-all leading-normal mt-1 text-[10px] bg-surface-container-low p-2.5 rounded border border-ink-black/10">
                      {selectedAsset.filePath}
                    </p>
                  </div>
                )}

                {selectedAsset.error && (
                  <div className="p-3 bg-error-container border-2 border-error text-on-error-container rounded-DEFAULT text-[10px] font-medium leading-normal shadow-[2px_2px_0px_#18181B]">
                    <span className="font-bold block mb-0.5">Download Error:</span>
                    {selectedAsset.error}
                  </div>
                )}
              </div>

              {/* Action buttons pinned */}
              {selectedAsset.status === 'completed' && (
                <div className="p-4 border-t-2 border-ink-black bg-surface-container-low flex gap-2">
                  <button
                    onClick={() => handleOpenFolder(selectedAsset.id)}
                    className="btn-secondary rounded-DEFAULT grow py-2.5 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    <span className="font-label-sm text-xs uppercase">Reveal in Folder</span>
                  </button>
                  <button
                    onClick={() => handleDelete(selectedAsset.id)}
                    className="btn-secondary rounded-DEFAULT py-2.5 px-3 flex items-center justify-center hover:bg-error-container hover:text-on-error-container hover:border-error transition-colors shrink-0 cursor-pointer"
                    title="Delete Asset"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
