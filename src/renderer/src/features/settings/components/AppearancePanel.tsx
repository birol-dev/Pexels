import type { PublicSettings } from '@renderer/lib/store'
import { cn } from '@renderer/lib/utils'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { THEME_OPTIONS } from '../utils'
import { SettingsSection } from './SettingsSection'

interface AppearancePanelProps {
  settings: PublicSettings
  form: SettingsForm
}

/** Literal colours: each tile shows its own theme whichever theme is on. */
const PREVIEW: Record<PublicSettings['theme'], { frame: string; canvas: string; ink: string }> = {
  'flat-white': { frame: 'bg-[#f4f4f4]', canvas: 'bg-white', ink: 'bg-[#141414]' },
  'flat-black': { frame: 'bg-[#181818]', canvas: 'bg-[#232323]', ink: 'bg-[#f4f4f4]' }
}

export function AppearancePanel({ settings, form }: AppearancePanelProps): React.JSX.Element {
  const current = settings.theme || 'flat-black'

  return (
    <SettingsSection id="settings-appearance" title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:max-w-md">
        {THEME_OPTIONS.map((option) => {
          const selected = current === option.value
          const colors = PREVIEW[option.value]
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => form.updateNow({ theme: option.value })}
              className={cn(
                'cursor-pointer rounded-2xl p-1.5 text-left transition-shadow focus-visible:outline-none',
                selected
                  ? 'ring-2 ring-on-surface'
                  : 'ring-1 ring-border hover:ring-control focus-visible:ring-2 focus-visible:ring-control'
              )}
            >
              <span
                className={cn('flex h-20 gap-1.5 overflow-hidden rounded-xl p-1.5', colors.frame)}
                aria-hidden
              >
                <span className="flex w-1/4 flex-col gap-1 pt-1">
                  <span className={cn('h-1.5 w-3/4 rounded-full opacity-90', colors.ink)} />
                  <span className={cn('h-1 w-2/3 rounded-full opacity-30', colors.ink)} />
                  <span className={cn('h-1 w-1/2 rounded-full opacity-30', colors.ink)} />
                </span>
                <span className={cn('flex flex-1 flex-col gap-1 rounded-lg p-2', colors.canvas)}>
                  <span className={cn('h-1.5 w-1/2 rounded-full opacity-80', colors.ink)} />
                  <span className="mt-auto flex gap-1">
                    <span className="h-5 flex-1 rounded-[4px] bg-[#e9b872]" />
                    <span className="h-5 flex-1 rounded-[4px] bg-[#8fb3c9]" />
                    <span className="h-5 flex-1 rounded-[4px] bg-[#c98f7a]" />
                  </span>
                </span>
              </span>
              <span className="block px-1.5 pt-2 pb-1 text-sm font-medium text-on-surface">
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
