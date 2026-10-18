import { CheckCircleIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import type { LlmProvider } from '../types'
import { PROVIDER_OPTIONS } from '../utils'
import { ProviderLogo } from './ProviderLogo'

interface ProviderPickerProps {
  value: LlmProvider
  onChange: (provider: LlmProvider) => void
}

export function ProviderPicker({ value, onChange }: ProviderPickerProps): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="LLM provider" className="grid grid-cols-3 gap-2.5">
      {PROVIDER_OPTIONS.map(({ id, label }) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex cursor-pointer flex-col items-start gap-6 rounded-2xl p-4 text-left transition-[box-shadow,background-color] outline-none',
              selected
                ? 'bg-background ring-2 ring-on-surface'
                : 'bg-surface-container hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-control'
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-background [&_svg]:size-5">
              <ProviderLogo provider={id} />
            </span>
            <span className="text-sm font-semibold text-on-surface">{label}</span>
            {selected && (
              <CheckCircleIcon
                size={18}
                weight="fill"
                className="absolute top-3 right-3 text-on-surface"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
