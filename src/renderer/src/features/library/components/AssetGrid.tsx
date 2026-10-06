import React from 'react'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { Card } from '@renderer/components/ui/card'
import type { FlatAsset } from '../types'
import { AssetCard } from './AssetCard'

interface AssetGridProps {
  assets: FlatAsset[]
  selectedId: string | undefined
  onSelect: (asset: FlatAsset) => void
}

export function AssetGrid({ assets, selectedId, onSelect }: AssetGridProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
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
      <CircleNotchIcon size={48} className="animate-spin text-primary" />
    </div>
  )
}

export function LibraryEmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <Card className="items-center p-12 text-center font-body-md text-muted-foreground">
      {message}
    </Card>
  )
}
