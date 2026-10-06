import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'
import { Slot } from 'radix-ui'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Lime brutalist call-to-action
        default:
          'bg-cyber-lime text-ink-black border-2 border-ink-black shadow-[4px_4px_0_var(--color-ink-black)] hover:brightness-95 active:translate-x-1 active:translate-y-1 active:shadow-none dark:border-secondary-container dark:text-on-primary-fixed dark:shadow-[4px_4px_0_var(--color-primary-container)]',
        // Paper / dark-surface button with hard border
        secondary:
          'bg-paper-white text-ink-black border-2 border-ink-black hover:bg-surface-variant active:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1)] dark:bg-surface-container-low dark:text-paper-white dark:border-surface-variant dark:shadow-[2px_2px_0_rgba(0,0,0,0.5)] dark:hover:border-cyber-lime dark:hover:text-cyber-lime dark:active:translate-y-0.5 dark:active:shadow-none',
        // Violet AI-action button
        violet:
          'bg-[#8b5cf6] text-white shadow-[0_2px_4px_rgba(139,92,246,0.2)] hover:bg-[#7c3aed] hover:shadow-[0_4px_12px_rgba(139,92,246,0.3)] dark:shadow-none dark:hover:shadow-none',
        destructive:
          'bg-destructive text-on-error hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
