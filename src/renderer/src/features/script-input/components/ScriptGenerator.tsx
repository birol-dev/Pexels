import React from 'react'
import { CircleNotchIcon, SparkleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useAppStore } from '@renderer/lib/store'
import { useExpandIdea } from '../hooks/useExpandIdea'
import type { FormSectionProps } from '../types'
import { GeneratedScriptPreview } from './GeneratedScriptPreview'

/** "Generate script from idea" action and the resulting editable preview. */
export function ScriptGenerator({ form, update }: FormSectionProps): React.JSX.Element {
  const expandIdea = useExpandIdea(form)
  const isMcp = useAppStore((s) => s.settings?.agentEngine === 'mcp')
  const isExpanding = !!form.isExpandingIdea
  const hasScript = !!form.script.trim()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-sm font-semibold text-on-surface">AI scriptwriter</span>
          <span className="text-[13px] text-outline">
            {isMcp
              ? 'Create the MCP pack below, then ask your connected AI app to write its draft script and find footage.'
              : 'Write the script first to read and edit it, or skip straight to the pack.'}
          </span>
        </div>
        {!isMcp && (
          <Button
            type="button"
            variant="secondary"
            onClick={expandIdea}
            disabled={isExpanding || !form.idea.trim()}
            className="bg-background hover:bg-background/70"
          >
            {isExpanding ? (
              <CircleNotchIcon size={18} className="animate-spin" />
            ) : (
              <SparkleIcon size={18} />
            )}
            <span>
              {isExpanding
                ? 'Writing the script…'
                : hasScript
                  ? 'Write it again'
                  : 'Write the script'}
            </span>
          </Button>
        )}
      </div>

      {hasScript && <GeneratedScriptPreview form={form} update={update} />}
    </div>
  )
}
