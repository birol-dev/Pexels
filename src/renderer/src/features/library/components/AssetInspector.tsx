import React from 'react'
import { CursorClickIcon, FolderOpenIcon, TrashIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import type { FlatAsset } from '../types'
import { AssetMetadata } from './AssetMetadata'
import { AssetPreview } from './AssetPreview'

interface AssetInspectorProps {
  asset: FlatAsset | null
  onReveal: (assetId: string) => void
  onDelete: (assetId: string) => void
}

/** The side panel: one tinted level, the picked file large, its credit and where it came from. */
export function AssetInspector({
  asset,
  onReveal,
  onDelete
}: AssetInspectorProps): React.JSX.Element {
  return (
    <aside
      aria-label="Asset details"
      className="rounded-3xl bg-surface-container-low p-3 lg:sticky lg:top-0 lg:col-span-4"
    >
      {!asset ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-container-high text-outline">
            <CursorClickIcon size={26} />
          </div>
          <h2 className="mt-5 text-base font-semibold text-on-surface">Pick a photo or clip</h2>
          <p className="mt-1.5 text-sm text-outline">
            Its credit, size, the search that found it and its place on disk show up here.
          </p>
        </div>
      ) : (
        <div className="animate-fade-in-up flex flex-col">
          <AssetPreview asset={asset} />
          <AssetMetadata asset={asset} />
          {asset.status === 'completed' && (
            <div className="flex gap-2 px-2 pb-2">
              <Button
                variant="secondary"
                className="grow bg-background hover:bg-background/70"
                onClick={() => onReveal(asset.id)}
              >
                <FolderOpenIcon size={18} />
                Show in folder
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete Asset"
                aria-label="Delete Asset"
                className="shrink-0 text-outline hover:bg-error-container hover:text-on-error-container"
                onClick={() => onDelete(asset.id)}
              >
                <TrashIcon size={18} />
              </Button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
