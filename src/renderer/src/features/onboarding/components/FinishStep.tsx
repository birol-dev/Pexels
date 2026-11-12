import {
  ArrowRightIcon,
  FolderIcon,
  ImagesIcon,
  PlugsConnectedIcon,
  WarningCircleIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import type { OnboardingController } from '../hooks/useOnboarding'
import { MCP_CLIENTS } from '../../../../../shared/mcp-clients'
import { PROVIDER_OPTIONS } from '../utils'
import { ProviderLogo } from './ProviderLogo'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { SummaryCard } from './SummaryCard'

type FinishStepProps = Pick<
  OnboardingController,
  | 'llmProvider'
  | 'useMcp'
  | 'mcpClientId'
  | 'modelId'
  | 'downloadFolder'
  | 'chooseFolder'
  | 'hasLlmKey'
  | 'hasPexelsKey'
  | 'finishing'
  | 'finishError'
  | 'finish'
> & { onEditAI: () => void; onEditPexels: () => void }

export function FinishStep({
  llmProvider,
  useMcp,
  mcpClientId,
  modelId,
  downloadFolder,
  chooseFolder,
  hasLlmKey,
  hasPexelsKey,
  finishing,
  finishError,
  finish,
  onEditAI,
  onEditPexels
}: FinishStepProps): React.JSX.Element {
  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.id === llmProvider)?.label ?? llmProvider
  const appName = MCP_CLIENTS.find((client) => client.id === mcpClientId)?.name ?? 'Your AI app'
  return (
    <StepCard>
      <StepHeader
        title={
          <>
            Review your <em>setup</em>
          </>
        }
        description={
          useMcp
            ? 'The next screen shows how to connect your AI app. You’ll need a Pexels key to find footage.'
            : 'You can finish setup now and add any missing keys before your first search.'
        }
      />

      <div className="flex flex-col gap-2">
        <SummaryCard
          icon={useMcp ? <PlugsConnectedIcon /> : <ProviderLogo provider={llmProvider} />}
          title={useMcp ? appName : providerLabel}
          value={useMcp ? 'Connect after setup' : hasLlmKey ? modelId : 'API key missing'}
          ok={useMcp || hasLlmKey}
          action={
            <Button
              size="sm"
              variant="ghost"
              disabled={finishing}
              onClick={onEditAI}
              aria-label="Edit AI setup"
            >
              {useMcp || hasLlmKey ? 'Change' : 'Add key'}
            </Button>
          }
        />
        <SummaryCard
          icon={<ImagesIcon />}
          title="Pexels"
          value={hasPexelsKey ? 'Key added' : 'Key required to find footage'}
          ok={hasPexelsKey}
          action={
            <Button
              size="sm"
              variant="ghost"
              disabled={finishing}
              onClick={onEditPexels}
              aria-label="Edit Pexels key"
            >
              {hasPexelsKey ? 'Change' : 'Add key'}
            </Button>
          }
        />
        <SummaryCard
          icon={<FolderIcon />}
          title="Download folder"
          value={downloadFolder || 'System default directory'}
          mono
          action={
            <Button
              size="sm"
              variant="ghost"
              disabled={finishing}
              onClick={chooseFolder}
              aria-label="Change download folder"
            >
              Change
            </Button>
          }
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
          {finishing ? 'Saving...' : useMcp ? 'Connect my AI app' : 'Start using StockFinder'}
          {!finishing && <ArrowRightIcon />}
        </Button>
      </div>
    </StepCard>
  )
}
