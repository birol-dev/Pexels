import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import type { VisualBeat } from '@renderer/lib/store'
import type { ApprovalSelection } from '../utils'
import { AssetTile } from './asset-tile'
import { BeatStatusIcon } from './beat-status-icon'
import { RejectedAssets } from './rejected-assets'

interface BeatCardProps {
  beat: VisualBeat
  reviewing: boolean
  selection: ApprovalSelection
  onApprove: (assetId: string) => void
  onReject: (assetId: string) => void
}

export function BeatCard({
  beat,
  reviewing,
  selection,
  onApprove,
  onReject
}: BeatCardProps): React.JSX.Element {
  return (
    <Card variant="raised" className="relative gap-0 p-6">
      <BeatStatusIcon status={beat.status} />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-outline tracking-widest uppercase">
            {beat.id.replace('_', ' ')}
          </span>
          <Badge
            variant="outline"
            className="border-2 border-edge bg-surface-variant px-2.5 py-1 font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface dark:bg-surface-container-lowest"
          >
            {beat.status}
          </Badge>
        </div>

        <p className="font-body-lg text-body-lg text-on-surface leading-relaxed pl-4 border-l-4 border-ink-black dark:border-primary-container">
          &ldquo;{beat.text}&rdquo;
        </p>

        <Card variant="sunken" className="gap-0 rounded-md p-4">
          <span className="font-mono text-[11px] text-primary uppercase font-bold block mb-1.5">
            Visual Direction:
          </span>
          <p className="text-xs text-outline leading-relaxed select-all">
            &ldquo;{beat.visualPrompt}&rdquo;
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {beat.searchQueries.map((query) => (
              <Badge
                key={query}
                variant="outline"
                className="border-2 border-edge bg-paper-white px-3 py-1 font-label-sm text-[12px] uppercase tracking-wider text-on-surface dark:bg-surface-container-lowest"
              >
                {query}
              </Badge>
            ))}
          </div>
        </Card>

        {beat.assets && beat.assets.length > 0 && (
          <div className="mt-4 pt-4 border-t-2 border-edge border-dashed flex gap-4 overflow-x-auto pb-2 scrollbar">
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
    </Card>
  )
}
