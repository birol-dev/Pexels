import React from 'react'
import { XIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface AttributionBannerProps {
  onDismiss: () => void
}

export function AttributionBanner({ onDismiss }: AttributionBannerProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3 rounded-md border-2 border-border bg-primary/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-on-surface">
        <span className="font-bold">Attribution required.</span> Credit photographers and link back
        to{' '}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline hover:text-secondary"
        >
          Pexels
        </a>{' '}
        when you publish or export these assets.
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <a
          href="https://www.pexels.com/api/documentation/"
          target="_blank"
          rel="noreferrer"
          className="font-label-sm text-xs tracking-wide text-on-surface uppercase underline hover:text-secondary"
        >
          Pexels API guidelines
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          title="Dismiss reminder"
          aria-label="Dismiss attribution reminder"
        >
          <XIcon size={16} />
        </Button>
      </div>
    </section>
  )
}
