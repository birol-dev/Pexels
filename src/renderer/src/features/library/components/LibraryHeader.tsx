import React from 'react'
import { DownloadSimpleIcon, FolderOpenIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
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
    <header className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-x-8 gap-y-5 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {activeJobId ? (
              <>
                {title}
                <span className="text-fade">, in the library</span>
              </>
            ) : (
              <>
                Media <em>library</em>
                <span className="text-fade">, every project</span>
              </>
            )}
          </h1>
        </div>

        {activeJobId && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button onClick={onOpenFolder}>
              <FolderOpenIcon size={18} />
              Open folder
            </Button>
            <Button variant="secondary" onClick={onExportManifest}>
              <DownloadSimpleIcon size={18} />
              Export manifest
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <MagnifyingGlassIcon
          size={18}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-outline"
        />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Photographer, search term or script line"
          aria-label="Search assets"
          className="border-transparent bg-surface-container pl-11 focus-visible:border-control focus-visible:bg-background"
        />
      </div>
    </header>
  )
}
