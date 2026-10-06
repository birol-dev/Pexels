import React from 'react'
import { Label } from '@renderer/components/ui/label'
import { cn } from '@renderer/lib/utils'

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>): React.JSX.Element {
  return (
    <Label
      className={cn(
        'mb-2 block font-title-md text-xs uppercase tracking-wide text-on-surface',
        className
      )}
      {...props}
    />
  )
}

export function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="font-label-sm text-xs text-outline mt-1.5">{children}</p>
}
