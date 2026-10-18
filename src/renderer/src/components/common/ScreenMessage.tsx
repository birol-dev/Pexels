import React from 'react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'

interface ScreenMessageProps {
  icon: Icon
  title: string
  description?: string
  spin?: boolean
  tone?: 'default' | 'error'
  children?: React.ReactNode
}

/** Full-screen centered status (loading / fatal error). */
export function ScreenMessage({
  icon: IconComponent,
  title,
  description,
  spin,
  tone = 'default',
  children
}: ScreenMessageProps): React.JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <IconComponent
          size={40}
          className={cn(tone === 'error' ? 'text-error' : 'text-outline', spin && 'animate-spin')}
        />
        <span className="text-base font-semibold text-on-surface">{title}</span>
        {description && <span className="text-sm text-outline">{description}</span>}
        {children}
      </div>
    </div>
  )
}
