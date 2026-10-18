import React from 'react'
import { PlayIcon } from '@phosphor-icons/react'
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

function statusText(asset: AssetRecord, reviewing: boolean): { text: string; className: string } {
  switch (asset.status) {
    case 'completed':
      return { text: 'Saved', className: 'text-on-surface' }
    case 'downloading':
      return { text: `${asset.progress || 0}%`, className: 'text-on-surface tabular-nums' }
    case 'failed':
      return { text: 'Failed', className: 'text-error' }
    default:
      return { text: reviewing ? 'To review' : 'Queued', className: 'text-outline' }
  }
}

/** The photo as it is, its credit and state underneath, review buttons below that. */
export function AssetTile({
  asset,
  reviewing,
  rejected,
  onApprove,
  onReject
}: AssetTileProps): React.JSX.Element {
  const status = statusText(asset, reviewing)
  const inReview = reviewing && asset.status === 'pending'
  return (
    <figure className="w-52 shrink-0">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-container">
        <img
          src={asset.imageUrl}
          className={cn(
            'size-full object-cover transition-[opacity,filter] duration-300',
            inReview && rejected && 'opacity-35 grayscale'
          )}
          alt="Stock Thumbnail"
        />
        {asset.type === 'video' && (
          <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon size={11} weight="fill" />
            <span className="sr-only">Video</span>
          </span>
        )}
      </div>

      {asset.status === 'downloading' && (
        <Progress value={asset.progress || 0} aria-label="Download progress" className="mt-2 h-1" />
      )}

      <figcaption className="mt-2 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="truncate text-on-surface-variant">{asset.photographer}</span>
        <span className={cn('shrink-0', status.className)}>{status.text}</span>
      </figcaption>

      {inReview && (
        <div className="mt-2 flex gap-1.5">
          <Button
            type="button"
            size="xs"
            variant={rejected ? 'secondary' : 'default'}
            onClick={onApprove}
            aria-pressed={!rejected}
            className="flex-1"
          >
            Approve
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={onReject}
            aria-pressed={rejected}
            className={cn(
              'flex-1',
              rejected && 'bg-error-container text-on-error-container hover:bg-error-container/80'
            )}
          >
            Reject
          </Button>
        </div>
      )}
    </figure>
  )
}
