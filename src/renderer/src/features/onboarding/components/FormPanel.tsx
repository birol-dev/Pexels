import { cn } from '@renderer/lib/utils'

export function FormPanel({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-6', className)} {...props} />
}
