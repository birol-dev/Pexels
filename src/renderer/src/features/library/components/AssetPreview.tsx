import React from 'react'
import { ImageBrokenIcon } from '@phosphor-icons/react'
import { toMediaUrl } from '@renderer/lib/media-url'
import type { FlatAsset } from '../types'

export function AssetPreview({ asset }: { asset: FlatAsset }): React.JSX.Element {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-b-2 border-border bg-black">
      {asset.status === 'completed' && asset.filePath ? (
        asset.type === 'video' ? (
          <video
            key={asset.filePath}
            src={toMediaUrl(asset.filePath)}
            controls
            className="h-full w-full object-contain"
          />
        ) : (
          <img
            src={toMediaUrl(asset.filePath)}
            className="h-full w-full object-contain"
            alt="Local Stock Preview"
          />
        )
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-surface-container opacity-60">
          <ImageBrokenIcon size={36} className="text-muted-foreground" />
          <span className="mt-1 font-mono text-[10px] font-bold text-muted-foreground">
            {asset.status === 'downloading' ? 'File is downloading...' : 'Local file missing'}
          </span>
        </div>
      )}
    </div>
  )
}
