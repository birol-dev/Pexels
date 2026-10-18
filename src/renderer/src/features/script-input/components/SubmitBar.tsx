import React from 'react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { useAppStore } from '@renderer/lib/store'
import type { FormSectionProps } from '../types'

export function SubmitBar({ form }: Pick<FormSectionProps, 'form'>): React.JSX.Element {
  const loading = useAppStore((s) => s.loading)
  const generatesScript = form.inputMode === 'idea' && !form.script.trim()
  const label = loading
    ? 'Starting…'
    : generatesScript
      ? 'Write the script and find footage'
      : 'Find footage'

  return (
    <div className="flex items-center justify-end border-t border-border pt-7">
      <LiquidMetalButton
        type="submit"
        label={label}
        width={generatesScript ? 300 : 180}
        disabled={loading || !!form.isExpandingIdea}
      />
    </div>
  )
}
