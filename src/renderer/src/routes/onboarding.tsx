import { useState } from 'react'
import { useOnboarding } from '@renderer/features/onboarding/hooks/useOnboarding'
import { AiProviderStep } from '@renderer/features/onboarding/components/AiProviderStep'
import { FinishStep } from '@renderer/features/onboarding/components/FinishStep'
import { OnboardingPreview } from '@renderer/features/onboarding/components/OnboardingPreview'
import { PexelsStep } from '@renderer/features/onboarding/components/PexelsStep'
import { WelcomeStep } from '@renderer/features/onboarding/components/WelcomeStep'
import { WizardLayout } from '@renderer/features/onboarding/components/WizardLayout'

export default function OnboardingView(): React.JSX.Element {
  const ob = useOnboarding()
  const { step, goTo } = ob
  const [editing, setEditing] = useState(false)
  const edit = (target: 2 | 3): void => {
    setEditing(true)
    goTo(target)
  }
  const review = (): void => {
    setEditing(false)
    goTo(4)
  }

  return (
    <WizardLayout step={step} preview={<OnboardingPreview {...ob} />}>
      {step === 1 && <WelcomeStep onStart={() => goTo(2)} />}
      {step === 2 && (
        <AiProviderStep
          {...ob}
          onBack={editing ? undefined : () => goTo(1)}
          onNext={editing ? review : () => goTo(3)}
          nextLabel={editing ? 'Back to review' : undefined}
        />
      )}
      {step === 3 && (
        <PexelsStep
          {...ob}
          onBack={editing ? undefined : () => goTo(2)}
          onNext={review}
          nextLabel={editing ? 'Back to review' : undefined}
        />
      )}
      {step === 4 && <FinishStep {...ob} onEditAI={() => edit(2)} onEditPexels={() => edit(3)} />}
    </WizardLayout>
  )
}
