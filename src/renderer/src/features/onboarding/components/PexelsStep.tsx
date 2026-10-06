import { ArrowSquareOutIcon, ImagesIcon, InfoIcon, SealCheckIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ConnectionTestRow } from './ConnectionTestRow'
import { Field } from './Field'
import { FormPanel } from './FormPanel'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { StepNav } from './StepNav'

type PexelsStepProps = Pick<OnboardingController, 'pexelsKey' | 'setPexelsKey' | 'pexelsTest'> & {
  onBack: () => void
  onNext: () => void
}

export function PexelsStep({
  pexelsKey,
  setPexelsKey,
  pexelsTest,
  onBack,
  onNext
}: PexelsStepProps): React.JSX.Element {
  return (
    <StepCard>
      <StepHeader
        step={3}
        icon={ImagesIcon}
        iconClassName="text-[#05a081]"
        title="Connect Pexels"
        description="StockFinder AI uses the Pexels API to search and retrieve high-quality stock b-roll footage. Let's link your Pexels developer key."
      />

      <FormPanel className="gap-6">
        <Field
          label="Pexels API Key"
          htmlFor="onboarding-pexels-key"
          action={
            <Button asChild variant="link" size="xs" className="h-auto p-0 font-mono text-[10px]">
              <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">
                Get Pexels API Key
                <ArrowSquareOutIcon />
              </a>
            </Button>
          }
        >
          <Input
            id="onboarding-pexels-key"
            type="password"
            value={pexelsKey}
            onChange={(e) => setPexelsKey(e.target.value)}
            className="font-mono text-xs"
            placeholder="Enter your key starting with '5634...'"
          />
        </Field>

        <ConnectionTestRow
          idleLabel="Test Key"
          idleIcon={SealCheckIcon}
          successText="Key Verified"
          failureText="Verification Failed"
          testing={pexelsTest.testing}
          result={pexelsTest.result}
          onTest={pexelsTest.run}
        />

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-container-low/50 p-4">
          <InfoIcon size={20} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[11px] leading-relaxed text-on-surface-variant">
            Your API key is stored locally in your system&apos;s secure keychain. It is strictly
            used to fetch footage directly from Pexels and is never sent to external servers.
          </p>
        </div>
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
