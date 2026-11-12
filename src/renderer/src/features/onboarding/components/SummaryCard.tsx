import { cn } from '@renderer/lib/utils'

interface SummaryCardProps {
  icon: React.ReactNode
  title: string
  value: string
  action?: React.ReactNode
  /** False marks something the user still has to fix. Defaults to true. */
  ok?: boolean
  mono?: boolean
  className?: string
}

export function SummaryCard({
  icon,
  title,
  value,
  action,
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
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        <p className={cn('truncate text-[13px] text-outline', mono && 'font-mono')}>{value}</p>
      </div>
      {action}
    </div>
  )
}
