import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { cn } from '@renderer/lib/utils'
import { TOTAL_STEPS } from '../utils'

interface WizardLayoutProps {
  step: number
  /** The app as it will look, beside the form. Hidden on narrow windows. */
  preview: React.ReactNode
  children: React.ReactNode
}

/** Two columns: the form (~470px) and, ~90px away, a preview window running off the edges. */
export function WizardLayout({ step, preview, children }: WizardLayoutProps): React.JSX.Element {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background font-sans text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <div className="relative z-10 flex h-full w-full flex-col overflow-y-auto px-8 py-8 sm:px-14 lg:w-[calc(470px+7rem)] lg:shrink-0">
        <div className="flex items-center justify-between gap-6">
          <BrandLogo variant="lockup" size="sm" />
          <div className="flex items-center gap-3" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
            <span className="text-[13px] text-outline tabular-nums" aria-hidden>
              {step}/{TOTAL_STEPS}
            </span>
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    i + 1 === step ? 'w-5 bg-on-surface' : 'w-1.5',
                    i + 1 < step && 'bg-on-surface',
                    i + 1 > step && 'bg-surface-container-highest'
                  )}
                />
              ))}
            </span>
          </div>
        </div>

        <main
          key={step}
          className="animate-fade-in-up my-auto flex w-full max-w-[470px] flex-col py-12"
        >
          {children}
        </main>
      </div>

      <div className="pointer-events-none absolute top-[12vh] -right-24 -bottom-24 left-[calc(470px+7rem+90px-3.5rem)] hidden lg:block">
        {preview}
      </div>
    </div>
  )
}
