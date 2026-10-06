import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

interface StepCardProps extends React.ComponentProps<typeof Card> {
  centered?: boolean
}

export function StepCard({ centered, className, ...props }: StepCardProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'gap-6 p-10 shadow-lg',
        centered && 'items-center text-center',
        className
      )}
      {...props}
    />
  )
}
