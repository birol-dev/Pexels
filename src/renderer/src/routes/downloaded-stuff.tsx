import React from 'react'
import { useAppStore } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import {
  AssetGrid,
  LibraryEmptyState,
  LibrarySpinner
} from '@renderer/features/library/components/AssetGrid'
import { AssetInspector } from '@renderer/features/library/components/AssetInspector'
import { AttributionBanner } from '@renderer/features/library/components/AttributionBanner'
import { EmptyWorkspace } from '@renderer/features/library/components/EmptyWorkspace'
import { FilterBar } from '@renderer/features/library/components/FilterBar'
import { LibraryHeader } from '@renderer/features/library/components/LibraryHeader'
import { ProjectGroup } from '@renderer/features/library/components/ProjectGroup'
import { useAssetFilters } from '@renderer/features/library/hooks/useAssetFilters'
import { useAttributionBanner } from '@renderer/features/library/hooks/useAttributionBanner'
import { useLibraryActions } from '@renderer/features/library/hooks/useLibraryActions'
import { useLibraryAssets } from '@renderer/features/library/hooks/useLibraryAssets'
import { filterProjects, matchesFilters } from '@renderer/features/library/utils'

export default function DownloadedStuffView(): React.JSX.Element {
  const activeJobId = useAppStore((s) => s.activeJobId)
  const activeJob = useAppStore((s) => s.activeJob)
  const navigate = useAppStore((s) => s.navigate)
  const setActiveJobId = useAppStore((s) => s.setActiveJobId)
  const openTab = useAppStore((s) => s.openTab)

  const library = useLibraryAssets()
  const { assets, loading, selectedAsset, setSelectedAsset, groupedProjects, groupedLoading } =
    library
  const filters = useAssetFilters()
  const banner = useAttributionBanner()
  const actions = useLibraryActions(library)

  const { searchQuery, typeFilter, statusFilter } = filters
  const filteredAssets = assets.filter((a) =>
    matchesFilters(a, searchQuery, typeFilter, statusFilter)
  )
  const filteredProjects = filterProjects(groupedProjects, searchQuery, typeFilter, statusFilter)

  if (!activeJobId && groupedProjects.length === 0 && !groupedLoading) {
    return <EmptyWorkspace onBack={() => navigate('input')} />
  }

  const inspectProject = (jobId: string): void => {
    setActiveJobId(jobId)
    openTab('stuff', jobId)
  }

  const renderContent = (): React.JSX.Element => {
    if (!activeJobId) {
      if (groupedLoading) return <LibrarySpinner />
      if (filteredProjects.length === 0) {
        return <LibraryEmptyState message="No matching assets found in any project workspace." />
      }
      return (
        <>
          {filteredProjects.map((project) => (
            <ProjectGroup
              key={project.jobId}
              project={project}
              selectedId={selectedAsset?.id}
              onSelect={setSelectedAsset}
              onInspect={inspectProject}
              onOpenFolder={(jobId) => api.assets.openProjectFolder(jobId)}
            />
          ))}
        </>
      )
    }
    if (loading) return <LibrarySpinner />
    if (filteredAssets.length === 0) {
      return <LibraryEmptyState message="No matching assets found in this project workspace." />
    }
    return (
      <AssetGrid
        assets={filteredAssets}
        selectedId={selectedAsset?.id}
        onSelect={setSelectedAsset}
      />
    )
  }

  return (
    <div className="relative z-10 flex flex-col gap-8">
      <LibraryHeader
        activeJobId={activeJobId}
        title={activeJobId ? activeJob?.title || 'test' : 'Media Library'}
        searchQuery={searchQuery}
        onSearchChange={filters.setSearchQuery}
        onOpenFolder={actions.openProjectFolder}
        onExportManifest={actions.exportManifest}
      />
      {banner.visible && <AttributionBanner onDismiss={banner.dismiss} />}
      <FilterBar
        typeFilter={typeFilter}
        onTypeChange={filters.setTypeFilter}
        statusFilter={statusFilter}
        onStatusChange={filters.setStatusFilter}
        showStatus={!!activeJobId}
      />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">{renderContent()}</div>
        <AssetInspector
          asset={selectedAsset}
          onReveal={actions.openAssetFolder}
          onDelete={actions.deleteAsset}
        />
      </div>
    </div>
  )
}
