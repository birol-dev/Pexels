import { cn } from '@renderer/lib/utils'

/** One step's column: header, fields, then the step navigation. */
export function StepCard({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-8', className)} {...props} />
}
