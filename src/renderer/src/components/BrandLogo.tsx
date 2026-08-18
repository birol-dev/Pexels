import React from 'react'
import brandLogoFull from '../assets/brand/stockfinder-logo.png'
import brandIconSquare from '../assets/brand/stockfinder-icon.png'

type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl'

type BrandLogoProps = {
  variant?: 'icon' | 'lockup' | 'fullsize'
  size?: BrandLogoSize
  className?: string
  alt?: string
}

const fullSizeClass: Record<BrandLogoSize, string> = {
  sm: 'h-8 w-auto max-w-[140px]',
  md: 'h-10 w-auto max-w-[170px]',
  lg: 'h-12 w-auto max-w-[200px]',
  xl: 'h-16 w-auto max-w-[260px]'
}

const iconSizeClass: Record<BrandLogoSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-14 w-14'
}

export function BrandLogo({
  variant = 'lockup',
  size = 'md',
  className = '',
  alt = 'StockFinder AI'
}: BrandLogoProps): React.JSX.Element {
  if (variant === 'icon') {
    const iconClass = `${iconSizeClass[size]} shrink-0 object-contain brand-logo-stroke`
    return (
      <img
        src={brandIconSquare}
        alt={alt}
        className={`${iconClass} ${className}`}
        draggable={false}
      />
    )
  }

  const logoClass = `${fullSizeClass[size]} shrink-0 object-contain brand-logo-stroke`
  return (
    <div className={`flex items-center shrink-0 ${className}`}>
      <img src={brandLogoFull} alt={alt} className={logoClass} draggable={false} />
    </div>
  )
}
