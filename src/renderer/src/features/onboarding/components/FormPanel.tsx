import { cn } from '@renderer/lib/utils'

export function FormPanel({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-xl border border-border bg-muted/40 p-6',
        className
      )}
      {...props}
    />
  )
}
