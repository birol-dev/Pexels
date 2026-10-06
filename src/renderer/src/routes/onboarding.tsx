import { useOnboarding } from '@renderer/features/onboarding/hooks/useOnboarding'
import { AiProviderStep } from '@renderer/features/onboarding/components/AiProviderStep'
import { FinishStep } from '@renderer/features/onboarding/components/FinishStep'
import { PexelsStep } from '@renderer/features/onboarding/components/PexelsStep'
import { StorageStep } from '@renderer/features/onboarding/components/StorageStep'
import { WelcomeStep } from '@renderer/features/onboarding/components/WelcomeStep'
import { WizardLayout } from '@renderer/features/onboarding/components/WizardLayout'

export default function OnboardingView(): React.JSX.Element {
  const ob = useOnboarding()
  const { step, goTo } = ob

  return (
    <WizardLayout step={step}>
      {step === 1 && <WelcomeStep onStart={() => goTo(2)} />}
      {step === 2 && <AiProviderStep {...ob} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
      {step === 3 && <PexelsStep {...ob} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
      {step === 4 && <StorageStep {...ob} onBack={() => goTo(3)} onNext={() => goTo(5)} />}
      {step === 5 && <FinishStep {...ob} />}
    </WizardLayout>
  )
}
