import { ArrowRightIcon } from '@phosphor-icons/react'
import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { Button } from '@renderer/components/ui/button'
import { StepCard } from './StepCard'
import { TOTAL_STEPS } from '../utils'

export function WelcomeStep({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <StepCard centered className="p-12">
      <div className="mb-6 flex justify-center">
        <BrandLogo variant="lockup" size="xl" />
      </div>

      <div className="mx-auto flex max-w-md flex-col items-center">
        <span className="mb-4 font-mono text-[11px] tracking-widest text-primary uppercase opacity-80">
          Step 1 of {TOTAL_STEPS}
        </span>
        <h2 className="mb-6 text-3xl leading-tight font-extrabold text-on-surface">
          Paste a script. Get stock footage.
        </h2>
        <p className="mb-10 text-sm leading-relaxed font-medium text-on-surface-variant">
          Our AI agent analyzes your script, finds matching media on Pexels, and downloads it into
          organized folders in minutes.
        </p>

        <Button size="lg" onClick={onStart} className="px-8 uppercase tracking-wider">
          Get Started
          <ArrowRightIcon weight="bold" />
        </Button>
      </div>
    </StepCard>
  )
}
