import React from 'react'
import { ArrowUpRightIcon } from '@phosphor-icons/react'
import type { FlatAsset } from '../types'
import { buildCreditLine, formatDuration, pexelsAssetPageUrl } from '../utils'

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="block text-[12px] text-outline">{children}</span>
}

function ExternalLink({ href, children }: { href: string; children: string }): React.JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-fit items-center gap-1 text-[13px] font-medium text-on-surface underline-offset-2 hover:underline"
    >
      {children}
      <ArrowUpRightIcon size={12} />
    </a>
  )
}

export function AssetMetadata({ asset }: { asset: FlatAsset }): React.JSX.Element {
  const duration = formatDuration(asset.duration)
  return (
    <div className="flex flex-col gap-5 px-3 py-5 text-[13px] text-on-surface">
      <div>
        <p className="text-base font-semibold text-on-surface">{buildCreditLine(asset)}</p>
        <div className="mt-2 flex flex-col gap-1.5">
          <ExternalLink href={pexelsAssetPageUrl(asset.type, asset.pexelsId)}>
            View it on Pexels
          </ExternalLink>
          {asset.photographerUrl && (
            <ExternalLink href={asset.photographerUrl}>The photographer’s profile</ExternalLink>
          )}
          <ExternalLink href="https://www.pexels.com">
            Photos and videos provided by Pexels
          </ExternalLink>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
        <div className="min-w-0">
          <dt>
            <FieldLabel>Creator</FieldLabel>
          </dt>
          <dd className="mt-0.5 truncate font-medium">{asset.photographer}</dd>
        </div>
        <div>
          <dt>
            <FieldLabel>Size</FieldLabel>
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {asset.width} × {asset.height}
          </dd>
        </div>
        {duration && (
          <div>
            <dt>
              <FieldLabel>Length</FieldLabel>
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">{duration}</dd>
          </div>
        )}
        <div>
          <dt>
            <FieldLabel>Type</FieldLabel>
          </dt>
          <dd className="mt-0.5 font-medium capitalize">{asset.type}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <FieldLabel>Found by searching</FieldLabel>
          <p className="mt-0.5 font-medium">&ldquo;{asset.query}&rdquo;</p>
        </div>
        <div>
          <FieldLabel>For the line</FieldLabel>
          <p className="mt-1 rounded-xl bg-background px-3 py-2.5 leading-relaxed">
            {asset.beatText}
          </p>
        </div>
        {asset.filePath && (
          <div>
            <FieldLabel>On disk</FieldLabel>
            <p className="mt-1 rounded-xl bg-background px-3 py-2.5 font-mono text-[12px] leading-normal break-all text-on-surface-variant select-all">
              {asset.filePath}
            </p>
          </div>
        )}
      </div>

      {asset.error && (
        <div className="rounded-xl bg-error-container px-3 py-2.5 leading-normal text-on-error-container">
          <span className="mb-0.5 block font-semibold">The download failed</span>
          {asset.error}
        </div>
      )}
    </div>
  )
}
