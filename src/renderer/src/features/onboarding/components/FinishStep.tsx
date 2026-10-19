import { ArrowRightIcon, FolderIcon, ImagesIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import type { OnboardingController } from '../hooks/useOnboarding'
import { PROVIDER_OPTIONS } from '../utils'
import { ProviderLogo } from './ProviderLogo'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
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
  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.id === llmProvider)?.label ?? llmProvider
  return (
    <StepCard>
      <StepHeader
        title={
          ready ? (
            <>
              You&apos;re <em>all set</em>
            </>
          ) : (
            <>
              Almost <em>there</em>
            </>
          )
        }
        description={
          ready
            ? 'Here is what StockFinder will use. You can change any of it later in Settings.'
            : 'You can start now, but a run needs both keys. Add the missing one in Settings.'
        }
      />

      <div className="flex flex-col gap-2">
        <SummaryCard
          icon={<ProviderLogo provider={llmProvider} />}
          title={providerLabel}
          value={modelId}
          status={hasLlmKey ? 'Ready' : 'No key'}
          ok={hasLlmKey}
        />
        <SummaryCard
          icon={<ImagesIcon />}
          title="Pexels"
          value="Photos and clips"
          status={hasPexelsKey ? 'Ready' : 'No key'}
          ok={hasPexelsKey}
        />
        <SummaryCard
          icon={<FolderIcon />}
          title="Download folder"
          value={downloadFolder || 'System default directory'}
          status="Ready"
          mono
        />
      </div>

      {finishError && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-error">
          <WarningCircleIcon size={16} className="shrink-0" />
          Could not save your settings: {finishError}
        </p>
      )}

      <div>
        <Button size="lg" onClick={finish} disabled={finishing}>
          {finishing ? 'Saving...' : 'Start using StockFinder'}
          {!finishing && <ArrowRightIcon />}
        </Button>
      </div>
    </StepCard>
  )
}
