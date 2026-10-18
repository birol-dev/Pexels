import React from 'react'
import { ImageBrokenIcon } from '@phosphor-icons/react'
import { toMediaUrl } from '@renderer/lib/media-url'
import type { FlatAsset } from '../types'

export function AssetPreview({ asset }: { asset: FlatAsset }): React.JSX.Element {
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-container-high">
      {asset.status === 'completed' && asset.filePath ? (
        asset.type === 'video' ? (
          <video
            key={asset.filePath}
            src={toMediaUrl(asset.filePath)}
            controls
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <img
            src={toMediaUrl(asset.filePath)}
            className="h-full w-full object-cover"
            alt="Local Stock Preview"
          />
        )
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 text-outline">
          <ImageBrokenIcon size={32} />
          <span className="text-[13px]">
            {asset.status === 'downloading' ? 'Still downloading…' : 'The file is not on disk'}
          </span>
        </div>
      )}
    </div>
  )
}
