import React from 'react'
import { PlayIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import type { FlatAsset } from '../types'
import { assetFilename, formatDuration } from '../utils'

interface AssetCardProps {
  asset: FlatAsset
  selected: boolean
  onSelect: (asset: FlatAsset) => void
}

const STATUS: Record<FlatAsset['status'], { label: string; className: string } | null> = {
  completed: null,
  failed: { label: 'Failed', className: 'text-error' },
  downloading: { label: 'Downloading', className: 'animate-pulse text-on-surface' },
  pending: { label: 'Waiting', className: 'text-on-surface' }
}

/** The photo first, uncropped colour and no text on it; the facts sit underneath in grey. */
export function AssetCard({ asset, selected, onSelect }: AssetCardProps): React.JSX.Element {
  const filename = assetFilename(asset)
  const durationStr = formatDuration(asset.duration)
  const status = STATUS[asset.status]

  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      aria-pressed={selected}
      className="group/asset block w-full cursor-pointer text-left focus-visible:outline-none"
    >
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-container ring-offset-2 ring-offset-background transition-shadow group-focus-visible/asset:ring-2 group-focus-visible/asset:ring-control',
          selected && 'ring-2 ring-on-surface group-focus-visible/asset:ring-on-surface'
        )}
      >
        <img
          className="size-full object-cover transition-transform duration-500 group-hover/asset:scale-[1.03]"
          src={asset.imageUrl}
          alt={filename}
          loading="lazy"
        />
        {asset.type === 'video' && (
          <span className="absolute right-2.5 bottom-2.5 flex h-6 items-center gap-1 rounded-full bg-black/55 px-2 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
            <PlayIcon size={10} weight="fill" aria-hidden />
            {durationStr || 'Video'}
          </span>
        )}
      </div>
      <div className="mt-2.5 min-w-0 px-0.5">
        <h3 className="truncate text-sm font-semibold text-on-surface">{filename}</h3>
        <p className="mt-0.5 truncate text-[13px] text-outline">
          {status && <span className={status.className}>{status.label} · </span>}
          {asset.photographer}
          <span className="tabular-nums">
            {' '}
            · {asset.width}×{asset.height}
          </span>
        </p>
      </div>
    </button>
  )
}
