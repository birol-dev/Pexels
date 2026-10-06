import { BrainIcon, PlugsConnectedIcon } from '@phosphor-icons/react'
import { Input } from '@renderer/components/ui/input'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ConnectionTestRow } from './ConnectionTestRow'
import { Field } from './Field'
import { FormPanel } from './FormPanel'
import { ProviderPicker } from './ProviderPicker'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { StepNav } from './StepNav'

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
  return (
    <StepCard>
      <StepHeader
        step={2}
        icon={BrainIcon}
        title="Connect your AI brain"
        description="Select the Large Language Model provider that will power your script analysis and visual prompt generation."
      />

      <ProviderPicker value={llmProvider} onChange={selectProvider} />

      <FormPanel>
        <Field label={`API Key for ${llmProvider.toUpperCase()}`} htmlFor="onboarding-llm-key">
          <Input
            id="onboarding-llm-key"
            type="password"
            value={activeKey}
            onChange={(e) => setActiveKey(e.target.value)}
            className="font-mono text-xs"
            placeholder={`Enter your ${llmProvider} API key`}
          />
        </Field>

        <Field label="Model ID" htmlFor="onboarding-model-id">
          <Input
            id="onboarding-model-id"
            type="text"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>

        <ConnectionTestRow
          idleLabel="Test Connection"
          idleIcon={PlugsConnectedIcon}
          successText="Connected Successfully"
          failureText="Connection Failed"
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
