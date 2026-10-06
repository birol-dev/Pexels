import React from 'react'
import { EyeIcon, FolderIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
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
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between border-b-2 border-border pb-4">
        <div>
          <h3 className="font-title-md text-[18px] leading-tight font-bold uppercase">
            {project.title}
          </h3>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Project ID: {project.jobId}
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => onInspect(project.jobId)}>
            <EyeIcon size={16} />
            Inspect Project
          </Button>
          <Button variant="secondary" onClick={() => onOpenFolder(project.jobId)}>
            <FolderIcon size={16} />
            Open Folder
          </Button>
        </div>
      </div>
      <AssetGrid assets={project.assets} selectedId={selectedId} onSelect={onSelect} />
    </Card>
  )
}
