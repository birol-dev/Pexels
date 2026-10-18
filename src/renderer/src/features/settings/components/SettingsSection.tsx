import { cn } from '@renderer/lib/utils'
import type { SettingsSectionId } from '../sections'

interface SettingsSectionProps {
  id: SettingsSectionId
  title: string
  /** One line under the title: what the section is for. */
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/** A titled block of the Settings form, opened by a hairline. The menu scrolls to its id. */
export function SettingsSection({
  id,
  title,
  description,
  action,
  className,
  children
}: SettingsSectionProps): React.JSX.Element {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-8 border-t border-border pt-6', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${id}-title`} className="text-title-md font-title-md text-on-surface">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-outline">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  )
}
