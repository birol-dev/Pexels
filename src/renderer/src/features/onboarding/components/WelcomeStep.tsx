import { ArrowRightIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { StepCard } from './StepCard'

export function WelcomeStep({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <StepCard>
      <h1 className="font-display-xl text-display-xl text-on-surface">
        Paste a script.{' '}
        <span className="text-fade">
          Get the <em className="text-on-surface">footage</em>.
        </span>
      </h1>
      <p className="text-body-lg text-outline">
        StockFinder reads your script, finds a Pexels photo or clip for every beat, and saves them
        to one folder per project. Setup takes about two minutes.
      </p>
      <div>
        <Button size="lg" onClick={onStart}>
          Get started
          <ArrowRightIcon />
        </Button>
      </div>
    </StepCard>
  )
}
