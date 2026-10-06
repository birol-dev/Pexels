import React from 'react'
import {
  CursorClickIcon,
  FolderOpenIcon,
  MagnifyingGlassPlusIcon,
  TrashIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import type { FlatAsset } from '../types'
import { AssetMetadata } from './AssetMetadata'
import { AssetPreview } from './AssetPreview'

interface AssetInspectorProps {
  asset: FlatAsset | null
  onReveal: (assetId: string) => void
  onDelete: (assetId: string) => void
}

export function AssetInspector({
  asset,
  onReveal,
  onDelete
}: AssetInspectorProps): React.JSX.Element {
  return (
    <Card className="gap-0 overflow-hidden py-0 lg:col-span-4">
      <div className="flex items-center gap-2 border-b-2 border-border bg-foreground p-4 text-background dark:bg-card dark:text-primary">
        <MagnifyingGlassPlusIcon size={22} />
        <h3 className="font-title-md text-[18px] font-bold tracking-wide uppercase">
          Asset Inspector
        </h3>
      </div>

      {!asset ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-sm border-2 border-border bg-card">
            <CursorClickIcon size={32} />
          </div>
          <h4 className="mb-2 font-title-md text-[18px] uppercase">No Asset Selected</h4>
          <p className="font-body-md text-[14px] text-muted-foreground">
            Select an asset from the library grid to inspect detailed spatial coordinates, metadata,
            and licensing status.
          </p>
        </div>
      ) : (
        <div className="flex animate-fade-in-up flex-col">
          <AssetPreview asset={asset} />
          <AssetMetadata asset={asset} />
          {asset.status === 'completed' && (
            <div className="flex gap-2 border-t-2 border-border bg-surface-container-low p-4">
              <Button variant="secondary" className="grow" onClick={() => onReveal(asset.id)}>
                <FolderOpenIcon size={18} />
                Reveal in Folder
              </Button>
              <Button
                variant="secondary"
                size="icon"
                title="Delete Asset"
                aria-label="Delete Asset"
                className="shrink-0 hover:border-error hover:bg-error-container hover:text-on-error-container"
                onClick={() => onDelete(asset.id)}
              >
                <TrashIcon size={18} />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
