import React from 'react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { useAppStore } from '@renderer/lib/store'
import type { FormSectionProps } from '../types'

export function SubmitBar({ form }: Pick<FormSectionProps, 'form'>): React.JSX.Element {
  const loading = useAppStore((s) => s.loading)
  const generatesScript = form.inputMode === 'idea' && !form.script.trim()
  const label = loading
    ? 'Starting Pipeline…'
    : generatesScript
      ? 'Generate Script & Fetch Assets'
      : 'Analyze & Fetch Assets'

  return (
    <div className="mt-section-gap flex justify-end border-t-2 border-dashed border-edge pt-8">
      <LiquidMetalButton
        type="submit"
        label={label}
        width={280}
        disabled={loading || !!form.isExpandingIdea}
      />
    </div>
  )
}
