import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'
import { Slot } from 'radix-ui'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Ink pill: the one main action on a screen, and selected states
        default: 'bg-primary-container text-on-primary-container hover:bg-primary-container/85',
        // Tinted pill: secondary actions
        secondary:
          'bg-secondary-container text-on-secondary-container hover:bg-surface-container-highest',
        // AI actions share the main action's ink now that the frame is monochrome
        violet: 'bg-primary-container text-on-primary-container hover:bg-primary-container/85',
        destructive:
          'bg-destructive text-on-error hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'border border-border bg-transparent text-on-surface hover:border-control hover:bg-surface-container',
        ghost: 'text-on-surface hover:bg-surface-container',
        link: 'h-auto px-0 text-on-surface underline decoration-border underline-offset-4 hover:decoration-on-surface active:scale-100'
      },
      size: {
        default: 'h-10 px-5 has-[>svg]:px-4',
        xs: "h-7 gap-1 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-8 gap-1.5 px-3.5 text-[13px] has-[>svg]:px-3',
        lg: 'h-11 px-6 text-[15px] has-[>svg]:px-5',
        icon: 'size-10',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-8',
        'icon-lg': 'size-11'
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
