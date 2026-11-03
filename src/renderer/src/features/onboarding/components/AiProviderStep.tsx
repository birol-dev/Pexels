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
  | 'useMcp'
  | 'setUseMcp'
  | 'selectProvider'
  | 'activeKey'
  | 'setActiveKey'
  | 'modelId'
  | 'setModelId'
  | 'llmTest'
> & { onBack: () => void; onNext: () => void }

export function AiProviderStep({
  llmProvider,
  useMcp,
  setUseMcp,
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
        description="Choose what plans your beats and picks the shots: an API provider or your own AI app through MCP."
      />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">How to use AI</legend>
        {[
          { mcp: false, label: 'AI API key' },
          { mcp: true, label: 'My AI app (MCP)' }
        ].map(({ mcp, label }) => (
          <label
            key={label}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-control p-4 text-sm font-semibold"
          >
            <input
              type="radio"
              name="onboarding-ai-mode"
              checked={useMcp === mcp}
              onChange={() => setUseMcp(mcp)}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {useMcp ? (
        <FormPanel>
          <p className="text-sm leading-relaxed text-on-surface">
            Your AI app controls StockFinder through a local MCP connection. You do not need an AI
            API key in StockFinder. You will still add a free Pexels key in the next step.
          </p>
          <p className="text-sm leading-relaxed text-outline">
            After setup, open Settings → MCP connection to copy your connection configuration. Keep
            StockFinder open and ask your AI app to create a pack from your script.
          </p>
        </FormPanel>
      ) : (
        <>
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
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
