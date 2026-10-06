import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { StepCard } from './StepCard'
import { TOTAL_STEPS } from '../utils'

export function WelcomeStep({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <StepCard centered className="p-12">
      <div className="mb-6 flex justify-center">
        <BrandLogo variant="lockup" size="xl" />
      </div>

      <div className="mx-auto flex max-w-md flex-col items-center">
        <span className="mb-4 font-mono text-[11px] tracking-widest text-primary uppercase">
          Step 1 of {TOTAL_STEPS}
        </span>
        <h2 className="mb-6 text-3xl leading-tight font-extrabold text-on-surface">
          Paste a script. Get stock footage.
        </h2>
        <p className="mb-10 text-sm leading-relaxed font-medium text-on-surface-variant">
          Our AI agent analyzes your script, finds matching media on Pexels, and downloads it into
          organized folders in minutes.
        </p>

        <LiquidMetalButton label="Get Started" onClick={onStart} />
      </div>
    </StepCard>
  )
}
