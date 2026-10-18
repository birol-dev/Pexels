import React from 'react'
import { cn } from '@renderer/lib/utils'

interface EmptyStateProps {
  /** Replaces the default grey picture. */
  art?: React.ReactNode
  /** Says what is missing, specifically ("No packs yet", not "Nothing here"). */
  title: string
  /** One line: why it is empty, or what to do next. */
  description: React.ReactNode
  /** The primary button. */
  action?: React.ReactNode
  /** A quieter link beside the button. */
  secondary?: React.ReactNode
  className?: string
}

/** A grey picture, a short bold title, one line of why/next, a button and a link. */
export function EmptyState({
  art,
  title,
  description,
  action,
  secondary,
  className
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-3xl bg-surface-container-low px-6 py-14 text-center',
        className
      )}
    >
      {art ?? <EmptyPicture />}
      <h3 className="mt-6 text-base font-semibold text-on-surface">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-outline">{description}</p>
      {(action || secondary) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          {action}
          {secondary}
        </div>
      )}
    </div>
  )
}

/** A ~120px grey photo: a sun over two hills, drawn in surface tints. */
export function EmptyPicture({ className }: { className?: string }): React.JSX.Element {
  const clipId = `empty-pic-${React.useId().replace(/[^\w-]/g, '')}`
  return (
    <svg
      viewBox="0 0 120 88"
      className={cn('h-[88px] w-[120px]', className)}
      aria-hidden
      focusable="false"
    >
      <clipPath id={clipId}>
        <rect width="120" height="88" rx="16" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="120" height="88" className="fill-surface-container-high" />
        <circle cx="84" cy="28" r="9" className="fill-background" />
        <path
          d="M0 70 L34 40 Q38 36.5 42 40 L66 61 L78 51 Q82 47.5 86 51 L120 80 V88 H0 Z"
          className="fill-surface-container-highest"
        />
      </g>
    </svg>
  )
}
