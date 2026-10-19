import React from 'react'
import { XIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface AttributionBannerProps {
  onDismiss: () => void
}

export function AttributionBanner({ onDismiss }: AttributionBannerProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-container py-3 pr-3 pl-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-on-surface-variant">
        <span className="font-semibold text-on-surface">Credit the photographers.</span> When you
        publish, name them and link back to{' '}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-on-surface underline underline-offset-2"
        >
          Pexels
        </a>
        .
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant="link" size="sm" className="text-on-surface-variant">
          <a href="https://www.pexels.com/api/documentation/" target="_blank" rel="noreferrer">
            Pexels guidelines
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          title="Dismiss reminder"
          aria-label="Dismiss attribution reminder"
        >
          <XIcon size={16} />
        </Button>
      </div>
    </div>
  )
}
