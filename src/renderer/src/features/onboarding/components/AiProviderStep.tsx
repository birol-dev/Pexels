import { PlugsConnectedIcon } from '@phosphor-icons/react'
import { Input } from '@renderer/components/ui/input'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ConnectionTestRow } from './ConnectionTestRow'
import { Field } from './Field'
import { FormPanel } from './FormPanel'
import { ProviderPicker } from './ProviderPicker'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { StepNav } from './StepNav'
import { PROVIDER_OPTIONS } from '../utils'

type AiProviderStepProps = Pick<
  OnboardingController,
  | 'llmProvider'
  | 'selectProvider'
  | 'activeKey'
  | 'setActiveKey'
  | 'modelId'
  | 'setModelId'
  | 'llmTest'
> & { onBack: () => void; onNext: () => void }

export function AiProviderStep({
  llmProvider,
  selectProvider,
  activeKey,
  setActiveKey,
  modelId,
  setModelId,
  llmTest,
  onBack,
  onNext
}: AiProviderStepProps): React.JSX.Element {
  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.id === llmProvider)?.label ?? llmProvider

  return (
    <StepCard>
      <StepHeader
        title={
          <>
            Connect <span className="text-fade">the</span> <em>AI</em>
          </>
        }
        description="It reads your script, splits it into beats and picks the shots. Use a key from any of the three."
      />

      <ProviderPicker value={llmProvider} onChange={selectProvider} />

      <FormPanel>
        <Field label={`${providerLabel} API key`} htmlFor="onboarding-llm-key">
          <Input
            id="onboarding-llm-key"
            type="password"
            value={activeKey}
            onChange={(e) => setActiveKey(e.target.value)}
            className="font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
            placeholder="Paste your key"
          />
        </Field>

        <Field label="Model" htmlFor="onboarding-model-id">
          <Input
            id="onboarding-model-id"
            type="text"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="font-mono text-[13px]"
          />
        </Field>

        <ConnectionTestRow
          idleLabel="Test connection"
          idleIcon={PlugsConnectedIcon}
          successText="Connected"
          failureText="Could not connect"
          testing={llmTest.testing}
          result={llmTest.result}
          onTest={llmTest.run}
          shakeOnFailure
        />
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
