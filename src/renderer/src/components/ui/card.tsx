import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const cardVariants = cva('flex flex-col gap-6 rounded-3xl py-7', {
  variants: {
    variant: {
      // Tinted panel: separation by background, never a border
      default: 'bg-card text-card-foreground',
      // Same panel; kept for callers that asked for a lifted look
      raised: 'bg-card text-card-foreground',
      // White (charcoal-dark) well for content nested one level inside a panel
      sunken: 'rounded-2xl bg-surface-container-lowest text-on-surface',
      // Informational callout
      info: 'bg-surface-container text-on-surface',
      // Failure callout
      danger: 'bg-error-container text-on-error-container',
      // Stronger tint for a highlighted panel
      accent: 'bg-surface-container-high text-on-surface'
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
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-7 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
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
      className={cn('text-[17px] leading-snug font-semibold tracking-[-0.005em]', className)}
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
  return <div data-slot="card-content" className={cn('px-7', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-7 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  cardVariants,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent
}
