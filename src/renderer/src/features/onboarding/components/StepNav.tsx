import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface StepNavProps {
  onBack: () => void
  onNext: () => void
}

export function StepNav({ onBack, onNext }: StepNavProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="ghost" onClick={onBack} className="-ml-3 text-on-surface-variant">
        <ArrowLeftIcon />
        Back
      </Button>

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onNext} className="text-outline">
          Skip for now
        </Button>
        <Button size="lg" onClick={onNext}>
          Continue
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  )
}
