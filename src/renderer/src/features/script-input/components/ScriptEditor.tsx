import React from 'react'
import { Textarea } from '@renderer/components/ui/textarea'
import type { FormSectionProps } from '../types'
import { FieldLabel } from './FieldLabel'
import { ScriptStats } from './ScriptStats'

/** Script-mode textarea for pasting a full narration. */
export function ScriptEditor({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="mb-2 flex items-baseline justify-between">
        <FieldLabel htmlFor="video-script" className="mb-0">
          Video Script
        </FieldLabel>
        <div className="flex items-center gap-3">
          {form.script.trim() && <ScriptStats script={form.script} />}
          <span className="font-label-sm text-xs text-outline">Markdown Supported</span>
        </div>
      </div>
      <Textarea
        id="video-script"
        rows={7}
        placeholder="Paste your complete video script narrative here. The AI will segment this script into visual beats and find matching Pexels stock assets..."
        value={form.script}
        onChange={(e) => update({ script: e.target.value })}
        className="min-h-40 resize-y px-4 py-3"
        required
      />
    </div>
  )
}
