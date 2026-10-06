import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

interface StepCardProps extends React.ComponentProps<typeof Card> {
  centered?: boolean
}

export function StepCard({ centered, className, ...props }: StepCardProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'gap-6 border-2 border-edge p-10 shadow-[6px_6px_0_var(--color-hard-shadow)] dark:shadow-[6px_6px_0_rgba(0,0,0,0.5)]',
        centered && 'items-center text-center',
        className
      )}
      {...props}
    />
  )
}
