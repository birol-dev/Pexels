import { PlugsConnectedIcon } from '@phosphor-icons/react'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { MCP_CLIENTS, type McpClientId } from '../../../../../shared/mcp-clients'
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
  | 'mcpClientId'
  | 'setMcpClientId'
  | 'selectProvider'
  | 'activeKey'
  | 'setActiveKey'
  | 'modelId'
  | 'setModelId'
  | 'llmTest'
  | 'hasLlmKey'
> & { onBack?: () => void; onNext: () => void; nextLabel?: string }

export function AiProviderStep({
  llmProvider,
  useMcp,
  setUseMcp,
  mcpClientId,
  setMcpClientId,
  selectProvider,
  activeKey,
  setActiveKey,
  modelId,
  setModelId,
  llmTest,
  hasLlmKey,
  onBack,
  onNext,
  nextLabel
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
        description="Choose what helps plan your shots. Use an AI app on this computer or bring an API key."
      />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">How to use AI</legend>
        {[
          { mcp: false, label: 'AI API key' },
          { mcp: true, label: 'My AI app' }
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
          <Field label="Your AI app" htmlFor="onboarding-ai-app">
            <Select
              value={mcpClientId}
              onValueChange={(value) => setMcpClientId(value as McpClientId)}
            >
              <SelectTrigger id="onboarding-ai-app" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MCP_CLIENTS.filter((client) => client.supported !== false).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-sm text-outline">
            We’ll open the setup guide for this app when you finish.
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

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={nextLabel ?? (!useMcp && !hasLlmKey ? 'Continue without key' : undefined)}
      />
    </StepCard>
  )
}
