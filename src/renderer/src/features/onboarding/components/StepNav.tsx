import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface StepNavProps {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
}

export function StepNav({
  onBack,
  onNext,
  nextLabel = 'Continue'
}: StepNavProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack && (
        <Button variant="ghost" onClick={onBack} className="-ml-3 text-on-surface-variant">
          <ArrowLeftIcon />
          Back
        </Button>
      )}
      <Button size="lg" className="ml-auto" onClick={onNext}>
        {nextLabel}
        <ArrowRightIcon />
      </Button>
    </div>
  )
}
