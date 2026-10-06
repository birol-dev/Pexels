import { Progress } from '@renderer/components/ui/progress'
import { stepProgressPercent } from '../utils'

interface WizardLayoutProps {
  step: number
  children: React.ReactNode
}

export function WizardLayout({ step, children }: WizardLayoutProps): React.JSX.Element {
  return (
    <div className="bg-background text-on-surface relative flex h-screen w-full flex-col items-center justify-center overflow-hidden font-sans selection:bg-primary-container selection:text-on-primary-container">
      <div className="pointer-events-none absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-primary/5 blur-[80px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-secondary-container/5 blur-[100px]" />

      {step > 1 && (
        <Progress
          value={stepProgressPercent(step)}
          aria-label="Setup progress"
          className="absolute top-0 left-0 z-50 h-1 rounded-none bg-surface-container-highest [&>div]:duration-500"
        />
      )}

      <main className="animate-fade-in-up relative z-10 mx-6 flex w-full max-w-2xl flex-col">
        {children}
      </main>
    </div>
  )
}
