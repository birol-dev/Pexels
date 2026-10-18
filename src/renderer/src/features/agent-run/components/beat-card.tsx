import React from 'react'
import type { VisualBeat } from '@renderer/lib/store'
import { BEAT_STATUS_LABEL, type ApprovalSelection } from '../utils'
import { AssetTile } from './asset-tile'
import { BeatStatusIcon } from './beat-status-icon'
import { RejectedAssets } from './rejected-assets'

interface BeatCardProps {
  beat: VisualBeat
  index: number
  reviewing: boolean
  selection: ApprovalSelection
  onApprove: (assetId: string) => void
  onReject: (assetId: string) => void
}

/** One beat as a row: its line, the direction and searches in a tint, then what it found. */
export function BeatCard({
  beat,
  index,
  reviewing,
  selection,
  onApprove,
  onReject
}: BeatCardProps): React.JSX.Element {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-5 py-8">
      <BeatStatusIcon status={beat.status} />

      <div className="flex min-w-0 flex-col">
        <p className="flex items-center gap-2 text-[13px] text-outline">
          <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <span aria-hidden>·</span>
          <span className={beat.status === 'failed' ? 'text-error' : undefined}>
            {BEAT_STATUS_LABEL[beat.status] ?? beat.status}
          </span>
        </p>

        <p className="mt-2 text-[17px] leading-relaxed text-on-surface">{beat.text}</p>

        {(beat.visualPrompt || beat.searchQueries.length > 0) && (
          <div className="mt-4 rounded-2xl bg-surface-container-low p-4">
            {beat.visualPrompt && (
              <>
                <span className="text-[12px] text-outline">Visual direction</span>
                <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant select-all">
                  {beat.visualPrompt}
                </p>
              </>
            )}
            {beat.searchQueries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {beat.searchQueries.map((query) => (
                  <span
                    key={query}
                    className="flex h-7 items-center rounded-full bg-background px-3 text-[12px] text-on-surface"
                  >
                    {query}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {beat.assets && beat.assets.length > 0 && (
          <div className="scrollbar -mx-1 mt-5 flex gap-3 overflow-x-auto px-1 pb-2">
            {beat.assets.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                reviewing={reviewing}
                rejected={selection[asset.id] === false}
                onApprove={() => onApprove(asset.id)}
                onReject={() => onReject(asset.id)}
              />
            ))}
          </div>
        )}

        {beat.rejectedAssets && beat.rejectedAssets.length > 0 && (
          <RejectedAssets items={beat.rejectedAssets} />
        )}
      </div>
    </li>
  )
}
