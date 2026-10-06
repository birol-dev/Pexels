import React from 'react'
import { CircleNotchIcon, SparkleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useExpandIdea } from '../hooks/useExpandIdea'
import type { FormSectionProps } from '../types'
import { GeneratedScriptPreview } from './GeneratedScriptPreview'

/** "Generate script from idea" action and the resulting editable preview. */
export function ScriptGenerator({ form, update }: FormSectionProps): React.JSX.Element {
  const expandIdea = useExpandIdea(form)
  const isExpanding = !!form.isExpandingIdea
  const hasScript = !!form.script.trim()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block font-title-md text-xs font-bold uppercase tracking-wide text-on-surface">
            AI Scriptwriter
          </span>
          <span className="text-xs text-outline">
            Preview and edit the AI-generated script, or proceed directly to pack generation.
          </span>
        </div>
        <Button
          type="button"
          variant="violet"
          onClick={expandIdea}
          disabled={isExpanding || !form.idea.trim()}
          className="uppercase tracking-wider"
        >
          {isExpanding ? (
            <CircleNotchIcon size={18} className="animate-spin" />
          ) : (
            <SparkleIcon size={18} />
          )}
          <span>
            {isExpanding
              ? 'Expanding Idea…'
              : hasScript
                ? 'Regenerate Script'
                : 'Generate Script from Idea'}
          </span>
        </Button>
      </div>

      {hasScript && <GeneratedScriptPreview form={form} update={update} />}
    </div>
  )
}
