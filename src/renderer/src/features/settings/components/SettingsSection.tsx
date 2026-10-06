import type { Icon } from '@phosphor-icons/react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

interface SettingsSectionProps {
  title: string
  icon: Icon
  iconClassName?: string
  /** Compact sections use a smaller muted heading (sidebar-style tiles). */
  compact?: boolean
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function SettingsSection({
  title,
  icon: IconComponent,
  iconClassName,
  compact = false,
  action,
  className,
  children
}: SettingsSectionProps): React.JSX.Element {
  return (
    <Card
      className={cn('gap-5 rounded-md border-2 border-edge bg-card py-0 shadow-hard', className)}
    >
      <CardContent className={cn('flex flex-1 flex-col gap-5', compact ? 'p-5' : 'p-6')}>
        <div className="flex items-center justify-between gap-2 border-b-2 border-edge pb-4">
          <h3
            className={cn(
              'flex items-center gap-2 uppercase',
              'font-title-md text-foreground',
              compact ? 'text-base' : 'text-title-md'
            )}
          >
            <IconComponent
              size={compact ? 20 : 22}
              weight="bold"
              className={cn(iconClassName)}
              aria-hidden
            />
            {title}
          </h3>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
