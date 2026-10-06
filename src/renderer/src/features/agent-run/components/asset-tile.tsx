import React from 'react'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { cn } from '@renderer/lib/utils'
import type { AssetRecord } from '@renderer/lib/store'

interface AssetTileProps {
  asset: AssetRecord
  reviewing: boolean
  rejected: boolean
  onApprove: () => void
  onReject: () => void
}

export function AssetTile({
  asset,
  reviewing,
  rejected,
  onApprove,
  onReject
}: AssetTileProps): React.JSX.Element {
  return (
    <div className="relative w-48 aspect-video shrink-0 bg-black brutal-border overflow-hidden group">
      <img
        src={asset.imageUrl}
        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
        alt="Stock Thumbnail"
      />

      {asset.status === 'pending' && (
        <div className="absolute inset-0 bg-paper-white/80 dark:bg-surface-container-lowest/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-2">
          <ArrowsClockwiseIcon size={18} className="text-primary animate-spin mb-1" />
          <span className="text-[11px] text-primary font-mono font-bold">Queued</span>
        </div>
      )}

      {asset.status === 'downloading' && (
        <div className="absolute inset-0 bg-paper-white/90 dark:bg-surface-container-lowest/90 flex flex-col items-center justify-center p-2">
          <span className="text-[11px] text-primary font-extrabold font-mono mb-1">
            {asset.progress || 0}%
          </span>
          <Progress
            value={asset.progress || 0}
            aria-label="Download progress"
            className="h-1 max-w-[50px] bg-surface-container-high [&>div]:bg-primary"
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent p-1.5 flex flex-col justify-end text-[11px]">
        <span className="text-white font-bold capitalize leading-none mb-0.5">{asset.type}</span>
        <div className="flex justify-between items-center text-neutral-300 font-mono text-[11px] leading-none mt-0.5">
          <span className="truncate max-w-[60px]">By {asset.photographer}</span>
          {asset.status === 'completed' && <span className="text-cyber-lime font-bold">Ready</span>}
          {asset.status === 'failed' && <span className="text-error font-bold">Failed</span>}
        </div>
      </div>

      {reviewing && asset.status === 'pending' && (
        <div className="absolute inset-x-1 top-1.5 flex gap-1.5 z-20">
          <Button
            type="button"
            size="xs"
            onClick={onApprove}
            className={cn(
              'flex-1 text-[11px]',
              rejected && 'bg-paper-white text-outline hover:bg-paper-white'
            )}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="xs"
            variant={rejected ? 'destructive' : 'secondary'}
            onClick={onReject}
            className={cn('flex-1 text-[11px]', !rejected && 'bg-paper-white text-outline')}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
