import React from 'react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { useAppStore } from '@renderer/lib/store'
import type { FormSectionProps } from '../types'

export function SubmitBar({ form }: Pick<FormSectionProps, 'form'>): React.JSX.Element {
  const loading = useAppStore((s) => s.loading)
  const isMcp = useAppStore((s) => s.settings?.agentEngine === 'mcp')
  const generatesScript = form.inputMode === 'idea' && !form.script.trim()
  const label = loading
    ? 'Starting…'
    : isMcp
      ? 'Create pack for MCP'
      : generatesScript
        ? 'Write the script and find footage'
        : 'Find footage'

  return (
    <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-7">
      {isMcp && (
        <p className="mr-auto max-w-sm text-[13px] text-outline">
          {generatesScript
            ? 'Your connected AI app will write the draft script, plan the beats and fill this pack.'
            : 'Your connected AI app will plan and fill this pack. Keep StockFinder open.'}
        </p>
      )}
      <LiquidMetalButton
        type="submit"
        label={label}
        width={isMcp ? 220 : generatesScript ? 300 : 180}
        disabled={loading || !!form.isExpandingIdea}
      />
    </div>
  )
}
