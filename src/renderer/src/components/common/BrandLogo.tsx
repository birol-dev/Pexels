import React from 'react'
import { cn } from '@renderer/lib/utils'
import brandIconSquare from '@renderer/assets/brand/stockfinder-icon.png'

type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl'

type BrandLogoProps = {
  variant?: 'icon' | 'lockup'
  size?: BrandLogoSize
  className?: string
  alt?: string
}

const iconSizeClass: Record<BrandLogoSize, string> = {
  sm: 'size-6',
  md: 'size-7',
  lg: 'size-9',
  xl: 'size-12'
}

const wordmarkSizeClass: Record<BrandLogoSize, string> = {
  sm: 'text-[15px]',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-2xl'
}

/** The mark in ink (see .brand-logo-stroke), and for the lockup the wordmark beside it. */
export function BrandLogo({
  variant = 'lockup',
  size = 'md',
  className,
  alt = 'StockFinder AI'
}: BrandLogoProps): React.JSX.Element {
  const mark = (
    <img
      src={brandIconSquare}
      alt={variant === 'icon' ? alt : ''}
      className={cn(iconSizeClass[size], 'shrink-0 object-contain brand-logo-stroke')}
      draggable={false}
    />
  )

  if (variant === 'icon') {
    return <span className={cn('inline-flex shrink-0', className)}>{mark}</span>
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-2.5', className)}
      role="img"
      aria-label={alt}
    >
      {mark}
      <span
        className={cn(
          'font-medium leading-none tracking-[-0.01em] whitespace-nowrap text-on-surface',
          wordmarkSizeClass[size]
        )}
        aria-hidden
      >
        StockFinder <span className="text-outline">AI</span>
      </span>
    </span>
  )
}
