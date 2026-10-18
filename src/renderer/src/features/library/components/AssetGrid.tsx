import React from 'react'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { EmptyState } from '@renderer/components/common/EmptyState'
import type { FlatAsset } from '../types'
import { AssetCard } from './AssetCard'

interface AssetGridProps {
  assets: FlatAsset[]
  selectedId: string | undefined
  onSelect: (asset: FlatAsset) => void
}

export function AssetGrid({ assets, selectedId, onSelect }: AssetGridProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedId === asset.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

export function LibrarySpinner(): React.JSX.Element {
  return (
    <div className="flex h-[300px] items-center justify-center">
      <CircleNotchIcon size={36} className="animate-spin text-outline" aria-label="Loading" />
    </div>
  )
}

export function LibraryEmptyState({ message }: { message: string }): React.JSX.Element {
  return <EmptyState title="Nothing matches" description={message} />
}
