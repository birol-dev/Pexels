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
    <div role="radiogroup" aria-label="LLM provider" className="mt-2 grid grid-cols-3 gap-4">
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
              'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected
                ? 'border-primary bg-primary/10'
                : 'border-border bg-muted/40 hover:bg-accent'
            )}
          >
            <ProviderLogo provider={id} />
            <span className="text-xs font-semibold text-on-surface">{label}</span>
            {selected && (
              <CheckCircleIcon
                size={16}
                weight="fill"
                className="absolute top-2 right-2 text-primary"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
