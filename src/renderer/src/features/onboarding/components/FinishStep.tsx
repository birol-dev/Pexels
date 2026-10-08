import { CheckCircleIcon, FolderIcon, ImagesIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ProviderLogo } from './ProviderLogo'
import { StepCard } from './StepCard'
import { SummaryCard } from './SummaryCard'

type FinishStepProps = Pick<
  OnboardingController,
  | 'llmProvider'
  | 'modelId'
  | 'downloadFolder'
  | 'hasLlmKey'
  | 'hasPexelsKey'
  | 'finishing'
  | 'finishError'
  | 'finish'
>

export function FinishStep({
  llmProvider,
  modelId,
  downloadFolder,
  hasLlmKey,
  hasPexelsKey,
  finishing,
  finishError,
  finish
}: FinishStepProps): React.JSX.Element {
  const ready = hasLlmKey && hasPexelsKey
  return (
    <StepCard centered className="p-8">
      <div className="relative mb-2 flex size-24 items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary-container opacity-10 blur-xl" />
        <div className="animate-float relative z-10 flex size-20 items-center justify-center rounded-sm border-2 border-edge bg-card">
          <CheckCircleIcon size={42} weight="fill" className="text-primary" />
        </div>
      </div>

      <div>
        <h1 className="mb-2 text-3xl font-extrabold text-on-surface">
          {ready ? "You're All Set!" : 'Almost There'}
        </h1>
        <p className="mx-auto max-w-sm text-xs text-on-surface-variant">
          {ready
            ? 'StockFinder AI is configured and ready. Here is a summary of your workspace parameters:'
            : 'You can start now, but a run needs both keys. Add the missing one in Settings.'}
        </p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-1 gap-4 text-left sm:grid-cols-2">
        <SummaryCard
          icon={<ProviderLogo provider={llmProvider} />}
          title="AI Provider"
          value={`${llmProvider.toUpperCase()} (${modelId})`}
          status={hasLlmKey ? 'Configured' : 'No key'}
          ok={hasLlmKey}
        />
        <SummaryCard
          icon={<ImagesIcon />}
          title="Media Source"
          value="Pexels API Link"
          status={hasPexelsKey ? 'Configured' : 'No key'}
          ok={hasPexelsKey}
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

      {finishError && (
        <p
          role="alert"
          className="flex max-w-lg items-start gap-1.5 text-left text-xs font-semibold text-error"
        >
          <WarningCircleIcon size={16} className="shrink-0" />
          Could not save your settings: {finishError}
        </p>
      )}

      <div className="mt-2">
        <LiquidMetalButton
          label={finishing ? 'Saving...' : 'Start Using StockFinder'}
          width={230}
          onClick={finish}
          disabled={finishing}
        />
      </div>
    </StepCard>
  )
}
