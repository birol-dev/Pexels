import { CheckCircleIcon, FolderIcon, ImagesIcon } from '@phosphor-icons/react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ProviderLogo } from './ProviderLogo'
import { StepCard } from './StepCard'
import { SummaryCard } from './SummaryCard'

type FinishStepProps = Pick<
  OnboardingController,
  'llmProvider' | 'modelId' | 'downloadFolder' | 'finish'
>

export function FinishStep({
  llmProvider,
  modelId,
  downloadFolder,
  finish
}: FinishStepProps): React.JSX.Element {
  return (
    <StepCard centered className="p-8">
      <div className="relative mb-2 flex size-24 items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary-container opacity-10 blur-xl" />
        <div className="animate-float relative z-10 flex size-20 items-center justify-center rounded-sm border-2 border-edge bg-card">
          <CheckCircleIcon size={42} weight="fill" className="text-primary" />
        </div>
      </div>

      <div>
        <h1 className="mb-2 text-3xl font-extrabold text-on-surface">You&apos;re All Set!</h1>
        <p className="mx-auto max-w-sm text-xs text-on-surface-variant">
          StockFinder AI is configured and ready. Here is a summary of your workspace parameters:
        </p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-1 gap-4 text-left sm:grid-cols-2">
        <SummaryCard
          icon={<ProviderLogo provider={llmProvider} />}
          title="AI Provider"
          value={`${llmProvider.toUpperCase()} (${modelId})`}
          status="Configured"
        />
        <SummaryCard
          icon={<ImagesIcon />}
          title="Media Source"
          value="Pexels API Link"
          status="Configured"
        />
        <SummaryCard
          className="sm:col-span-2"
          icon={<FolderIcon />}
          title="Local Export Directory"
          value={downloadFolder || 'System default directory'}
          status="Ready"
          mono
        />
      </div>

      <div className="mt-2">
        <LiquidMetalButton label="Start Using StockFinder" width={230} onClick={finish} />
      </div>
    </StepCard>
  )
}
