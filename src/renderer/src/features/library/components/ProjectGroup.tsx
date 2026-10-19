import React from 'react'
import { ArrowRightIcon, FolderIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import type { FlatAsset, GroupedProject } from '../types'
import { AssetGrid } from './AssetGrid'

interface ProjectGroupProps {
  project: GroupedProject
  selectedId: string | undefined
  onSelect: (asset: FlatAsset) => void
  onInspect: (jobId: string) => void
  onOpenFolder: (jobId: string) => void
}

export function ProjectGroup({
  project,
  selectedId,
  onSelect,
  onInspect,
  onOpenFolder
}: ProjectGroupProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-title-md font-title-md text-on-surface">{project.title}</h2>
          <p className="mt-0.5 text-[13px] text-outline">
            {project.assets.length} {project.assets.length === 1 ? 'file' : 'files'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-on-surface-variant"
            onClick={() => onOpenFolder(project.jobId)}
          >
            <FolderIcon size={16} />
            Open folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onInspect(project.jobId)}>
            Open project
            <ArrowRightIcon size={16} />
          </Button>
        </div>
      </div>
      <AssetGrid assets={project.assets} selectedId={selectedId} onSelect={onSelect} />
    </section>
  )
}
