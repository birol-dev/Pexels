import React from 'react'
import { InfoIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { FlatAsset } from '../types'
import { assetFilename, buildCreditLine, formatDuration, pexelsAssetPageUrl } from '../utils'

interface AssetCardProps {
  asset: FlatAsset
  selected: boolean
  onSelect: (asset: FlatAsset) => void
}

function StatusBadge({ status }: { status: FlatAsset['status'] }): React.JSX.Element {
  if (status === 'completed') {
    return (
      <Badge className="border-2 border-foreground bg-primary text-[10px] font-bold tracking-widest text-primary-foreground uppercase shadow-[2px_2px_0px_#18181B]">
        Ready
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge className="border-2 border-foreground bg-error-container text-[10px] font-bold tracking-widest text-on-error-container uppercase shadow-[2px_2px_0px_#18181B]">
        Failed
      </Badge>
    )
  }
  return (
    <Badge className="animate-pulse border-2 border-foreground bg-muted text-[10px] font-bold tracking-widest text-foreground uppercase shadow-[2px_2px_0px_#18181B]">
      Active
    </Badge>
  )
}

export function AssetCard({ asset, selected, onSelect }: AssetCardProps): React.JSX.Element {
  const filename = assetFilename(asset)
  const durationStr = formatDuration(asset.duration)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(asset)
        }
      }}
      className={cn(
        'group relative flex h-[320px] cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-border bg-card shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-[4px_4px_0px_#18181B]',
        selected && 'ring-4 ring-secondary'
      )}
    >
      <div className="absolute top-3 left-3 z-10">
        <StatusBadge status={asset.status} />
      </div>

      <div className="relative h-48 w-full overflow-hidden border-b-2 border-border bg-black">
        <img
          className="h-full w-full object-cover opacity-90 mix-blend-luminosity transition-transform duration-500 group-hover:scale-105 group-hover:opacity-100 hover:mix-blend-normal"
          src={asset.imageUrl}
          alt={filename}
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
        {durationStr && (
          <span className="absolute right-2 bottom-2 rounded border border-white/20 bg-black/80 px-2 py-0.5 font-label-sm text-[10px] text-white">
            {durationStr}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <h3 className="truncate font-title-md text-[16px] leading-tight font-bold text-card-foreground">
            {filename}
          </h3>
          <p className="mt-1 font-body-md text-[12px] text-muted-foreground">
            {asset.width}x{asset.height} • {asset.type.toUpperCase()}
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t-2 border-dashed border-border pt-3">
          <a
            href={asset.photographerUrl || pexelsAssetPageUrl(asset.type, asset.pexelsId)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="truncate font-label-sm text-[11px] tracking-wider text-muted-foreground uppercase hover:text-secondary hover:underline"
          >
            {buildCreditLine(asset)}
          </a>
          <InfoIcon size={16} className="shrink-0 text-foreground" />
        </div>
      </div>
    </div>
  )
}
