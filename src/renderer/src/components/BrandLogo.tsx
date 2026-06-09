import React from 'react'
import brandIcon from '../assets/brand/stockfinder-icon.png'

type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl'

type BrandLogoProps = {
  variant?: 'icon' | 'lockup'
  size?: BrandLogoSize
  className?: string
  alt?: string
}

const iconSizeClass: Record<BrandLogoSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-14 w-14'
}

const textSizeClass: Record<BrandLogoSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl'
}

export function BrandLogo({
  variant = 'icon',
  size = 'md',
  className = '',
  alt = 'StockFinder AI'
}: BrandLogoProps): React.JSX.Element {
  const iconClass = `${iconSizeClass[size]} shrink-0 object-contain`

  if (variant === 'lockup') {
    return (
      <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
        <img src={brandIcon} alt="" aria-hidden="true" className={iconClass} draggable={false} />
        <span
          className={`font-headline-lg-mobile font-black text-ink-black dark:text-paper-white tracking-tighter leading-none whitespace-nowrap ${textSizeClass[size]}`}
        >
          StockFinder <span className="text-primary">AI</span>
        </span>
      </div>
    )
  }

  return (
    <img src={brandIcon} alt={alt} className={`${iconClass} ${className}`} draggable={false} />
  )
}
