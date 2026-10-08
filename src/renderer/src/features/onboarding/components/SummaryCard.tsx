import { CheckIcon, WarningIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

interface SummaryCardProps {
  icon: React.ReactNode
  title: string
  value: string
  status: string
  /** False marks something the user still has to fix. Defaults to true. */
  ok?: boolean
  mono?: boolean
  className?: string
}

export function SummaryCard({
  icon,
  title,
  value,
  status,
  ok = true,
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
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-sm border [&_svg]:size-5',
          ok
            ? 'border-secondary/20 bg-secondary/10 text-secondary'
            : 'border-edge bg-error-container text-on-error-container'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 grow">
        <h4 className="mb-0.5 text-xs font-semibold text-on-surface">{title}</h4>
        <p className={cn('truncate text-xs text-on-surface-variant', mono && 'font-mono')}>
          {value}
        </p>
        <Badge
          variant="outline"
          className={cn(
            'mt-1.5 gap-1 font-mono text-[11px] uppercase',
            ok
              ? 'border-secondary/20 bg-secondary/10 text-secondary'
              : 'border-edge bg-error-container text-on-error-container'
          )}
        >
          {ok ? <CheckIcon size={10} weight="bold" /> : <WarningIcon size={10} weight="bold" />}
          {status}
        </Badge>
      </div>
    </div>
  )
}
