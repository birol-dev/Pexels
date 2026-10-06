import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-border bg-input px-3 py-1 text-base shadow-[inset_4px_4px_8px_rgba(0,0,0,0.05)] transition-[color,box-shadow,border-color] outline-none dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.5)] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ink-black focus-visible:shadow-[3px_3px_0_var(--color-ink-black)] dark:focus-visible:border-cyber-lime dark:focus-visible:shadow-[3px_3px_0_var(--color-cyber-lime)]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  )
}

export { Input }
