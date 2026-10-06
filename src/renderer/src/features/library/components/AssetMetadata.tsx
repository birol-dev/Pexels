import React from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Separator } from '@renderer/components/ui/separator'
import type { FlatAsset } from '../types'
import { buildCreditLine, pexelsAssetPageUrl } from '../utils'

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="block font-mono text-[9px] text-muted-foreground uppercase">{children}</span>
  )
}

function ExternalLink({ href, children }: { href: string; children: string }): React.JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 text-[11px] font-bold text-secondary hover:underline"
    >
      {children}
      <ArrowSquareOutIcon size={12} />
    </a>
  )
}

export function AssetMetadata({ asset }: { asset: FlatAsset }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 p-5 text-xs font-semibold text-muted-foreground">
      <div>
        <FieldLabel>Pexels Attribution</FieldLabel>
        <p className="mt-0.5 text-[11px] font-semibold text-on-surface">{buildCreditLine(asset)}</p>
        <div className="mt-2 flex flex-col gap-1">
          <ExternalLink href={pexelsAssetPageUrl(asset.type, asset.pexelsId)}>
            View asset on Pexels
          </ExternalLink>
          {asset.photographerUrl && (
            <ExternalLink href={asset.photographerUrl}>View photographer profile</ExternalLink>
          )}
          <ExternalLink href="https://www.pexels.com">
            Photos and videos provided by Pexels
          </ExternalLink>
        </div>
      </div>

      <Separator className="border-t border-dashed bg-transparent" />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Creator</FieldLabel>
          <p className="mt-0.5 truncate font-bold text-on-surface">{asset.photographer}</p>
        </div>
        <div>
          <FieldLabel>Resolution</FieldLabel>
          <p className="mt-0.5 font-bold text-on-surface">
            {asset.width} × {asset.height}
          </p>
        </div>
        {asset.duration !== undefined && (
          <div>
            <FieldLabel>Duration</FieldLabel>
            <p className="mt-0.5 font-bold text-on-surface">{asset.duration}s</p>
          </div>
        )}
        <div>
          <FieldLabel>Type</FieldLabel>
          <p className="mt-0.5 font-bold text-on-surface capitalize">{asset.type}</p>
        </div>
      </div>

      <Separator className="border-t border-dashed bg-transparent" />

      <div>
        <FieldLabel>Search Query Context</FieldLabel>
        <p className="mt-1 font-mono text-[11px] font-bold text-on-surface italic">
          &ldquo;{asset.query}&rdquo;
        </p>
      </div>

      <div>
        <FieldLabel>Script beat segment</FieldLabel>
        <p className="mt-1 rounded border border-border/40 bg-surface-container-low p-2.5 text-[11px] leading-relaxed text-on-surface italic">
          &ldquo;{asset.beatText}&rdquo;
        </p>
      </div>

      {asset.filePath && (
        <div>
          <FieldLabel>Local Disk Path</FieldLabel>
          <p className="mt-1 rounded border border-border/40 bg-surface-container-low p-2.5 font-mono text-[10px] leading-normal break-all text-muted-foreground select-all">
            {asset.filePath}
          </p>
        </div>
      )}

      {asset.error && (
        <div className="rounded-md border-2 border-error bg-error-container p-3 text-[10px] leading-normal font-medium text-on-error-container shadow-[2px_2px_0px_#18181B]">
          <span className="mb-0.5 block font-bold">Download Error:</span>
          {asset.error}
        </div>
      )}
    </div>
  )
}
