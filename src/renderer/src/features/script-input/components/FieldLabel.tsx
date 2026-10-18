import React from 'react'
import { Label } from '@renderer/components/ui/label'
import { cn } from '@renderer/lib/utils'

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>): React.JSX.Element {
  return (
    <Label
      className={cn('mb-2.5 block text-[13px] leading-snug font-medium text-on-surface', className)}
      {...props}
    />
  )
}

export function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-2 text-[13px] text-outline">{children}</p>
}
