import { CheckIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

interface SummaryCardProps {
  icon: React.ReactNode
  title: string
  value: string
  status: string
  mono?: boolean
  className?: string
}

export function SummaryCard({
  icon,
  title,
  value,
  status,
  mono,
  className
}: SummaryCardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground',
        className
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-secondary/20 bg-secondary/10 text-secondary [&_svg]:size-5">
        {icon}
      </div>
      <div className="min-w-0 grow">
        <h4 className="mb-0.5 text-xs font-semibold text-on-surface">{title}</h4>
        <p className={cn('truncate text-xs text-on-surface-variant', mono && 'font-mono')}>
          {value}
        </p>
        <Badge
          variant="outline"
          className="mt-1.5 gap-1 border-secondary/20 bg-secondary/10 font-mono text-[11px] text-secondary uppercase"
        >
          <CheckIcon size={10} weight="bold" />
          {status}
        </Badge>
      </div>
    </div>
  )
}
