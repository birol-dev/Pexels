import { ArrowUpRightIcon, LockSimpleIcon, SealCheckIcon } from '@phosphor-icons/react'
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
        title={
          <>
            Connect <em>Pexels</em>
          </>
        }
        description="Every photo and clip comes from Pexels. Their API key is free and takes a minute to get."
      />

      <FormPanel>
        <Field
          label="Pexels API key"
          htmlFor="onboarding-pexels-key"
          action={
            <Button asChild variant="link" size="xs" className="h-auto p-0 text-[13px]">
              <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">
                Get a free key
                <ArrowUpRightIcon />
              </a>
            </Button>
          }
        >
          <Input
            id="onboarding-pexels-key"
            type="password"
            value={pexelsKey}
            onChange={(e) => setPexelsKey(e.target.value)}
            className="font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
            placeholder="Paste your key"
          />
        </Field>

        <ConnectionTestRow
          idleLabel="Test key"
          idleIcon={SealCheckIcon}
          successText="Key works"
          failureText="The key did not work"
          testing={pexelsTest.testing}
          result={pexelsTest.result}
          onTest={pexelsTest.run}
        />

        <div className="flex items-start gap-3 rounded-2xl bg-surface-container p-4">
          <LockSimpleIcon size={18} className="mt-px shrink-0 text-outline" />
          <p className="text-[13px] leading-relaxed text-on-surface-variant">
            Your API key is stored locally in your system&apos;s secure keychain. It is strictly
            used to fetch footage directly from Pexels and is never sent to external servers.
          </p>
        </div>
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
