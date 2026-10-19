import { CheckIcon, WarningIcon } from '@phosphor-icons/react'
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
        'flex items-center gap-3.5 rounded-2xl bg-surface-container p-3.5 pr-4',
        className
      )}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5',
          ok ? 'bg-background text-on-surface' : 'bg-error-container text-on-error-container'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 grow">
        <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
        <p className={cn('truncate text-[13px] text-outline', mono && 'font-mono')}>{value}</p>
      </div>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-[13px] font-medium',
          ok ? 'text-on-surface-variant' : 'text-error'
        )}
      >
        {ok ? <CheckIcon size={14} weight="bold" /> : <WarningIcon size={14} weight="bold" />}
        {status}
      </span>
    </div>
  )
}
