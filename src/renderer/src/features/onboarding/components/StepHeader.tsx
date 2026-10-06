import type { Icon } from '@phosphor-icons/react'
import { TOTAL_STEPS } from '../utils'

interface StepHeaderProps {
  step: number
  title: string
  description: string
  icon?: Icon
  iconClassName?: string
}

export function StepHeader({
  step,
  title,
  description,
  icon: IconComponent,
  iconClassName = 'text-primary'
}: StepHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="font-mono text-[11px] tracking-widest text-primary uppercase">
        Step {step} of {TOTAL_STEPS}
      </span>
      <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-on-surface">
        {IconComponent && <IconComponent size={28} weight="duotone" className={iconClassName} />}
        {title}
      </h2>
      <p className="mt-1 max-w-lg text-xs text-on-surface-variant">{description}</p>
    </div>
  )
}
