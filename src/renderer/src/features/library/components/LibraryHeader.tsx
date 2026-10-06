import React from 'react'
import {
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  TreeStructureIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { Input } from '@renderer/components/ui/input'

interface LibraryHeaderProps {
  activeJobId: string | null
  title: string
  searchQuery: string
  onSearchChange: (value: string) => void
  onOpenFolder: () => void
  onExportManifest: () => void
}

export function LibraryHeader({
  activeJobId,
  title,
  searchQuery,
  onSearchChange,
  onOpenFolder,
  onExportManifest
}: LibraryHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-col justify-between gap-4 border-b-2 border-border pb-6 md:flex-row md:items-center">
      <div className="flex flex-col">
        <h2 className="text-headline-lg font-headline-lg leading-none tracking-tight text-on-surface uppercase">
          Media Library
        </h2>
        <span className="mt-2 flex items-center gap-2 text-body-md font-body-md text-muted-foreground">
          <TreeStructureIcon size={18} />
          {activeJobId ? (
            <>
              Project:{' '}
              <strong className="border-b-2 border-primary text-on-surface">{title}</strong>
            </>
          ) : (
            'All Projects Downloads'
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <MagnifyingGlassIcon
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search assets..."
            aria-label="Search assets"
            className="w-64 pl-10"
          />
        </div>

        {activeJobId && (
          <>
            <LiquidMetalButton label="Open Folder" width={150} onClick={onOpenFolder} />
            <Button variant="secondary" onClick={onExportManifest}>
              <DownloadSimpleIcon size={18} />
              Export Manifest
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
