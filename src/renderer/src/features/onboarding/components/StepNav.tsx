import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface StepNavProps {
  onBack: () => void
  onNext: () => void
}

export function StepNav({ onBack, onNext }: StepNavProps): React.JSX.Element {
  return (
    <div className="mt-4 flex items-center justify-between border-t border-border pt-6">
      <Button variant="ghost" onClick={onBack} className="text-on-surface-variant">
        <ArrowLeftIcon weight="bold" />
        Back
      </Button>

      <div className="flex items-center gap-4">
        <Button variant="link" size="sm" onClick={onNext} className="text-outline">
          Skip for now
        </Button>
        <Button onClick={onNext}>
          Next Step
          <ArrowRightIcon weight="bold" />
        </Button>
      </div>
    </div>
  )
}
