import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const cardVariants = cva('flex flex-col gap-6 rounded-xl border-2 border-edge py-6', {
  variants: {
    variant: {
      // Flat panel
      default: 'bg-card text-card-foreground',
      // Panel lifted with the hard offset shadow
      raised: 'bg-card text-card-foreground shadow-md',
      // Recessed well, for content nested inside another card
      sunken: 'bg-surface-container-low text-on-surface dark:bg-surface-container-lowest',
      // Informational callout
      info: 'bg-tertiary-container text-on-tertiary-container shadow-md',
      // Failure callout
      danger: 'bg-error-container text-on-error-container shadow-sm',
      // Lime-tinted callout
      accent: 'bg-primary-container/30 text-on-surface'
    }
  },
  defaultVariants: { variant: 'default' }
})

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant ?? 'default'}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export { Card, cardVariants, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
