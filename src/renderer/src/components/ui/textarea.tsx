import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-control bg-input px-3 py-2 text-base shadow-[inset_4px_4px_8px_rgba(0,0,0,0.05)] transition-[color,box-shadow,border-color] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.5)] outline-none placeholder:text-muted-foreground focus-visible:border-hard-shadow focus-visible:shadow-[3px_3px_0_var(--color-hard-shadow)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
