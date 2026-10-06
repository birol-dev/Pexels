import React from 'react'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Textarea } from '@renderer/components/ui/textarea'
import type { FormSectionProps } from '../types'
import { ScriptStats } from './ScriptStats'

/** Editable preview of the AI-generated narration plus its visual direction. */
export function GeneratedScriptPreview({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <Card variant="raised" className="animate-fade-in-up gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-edge pb-3">
        <div className="flex items-center gap-2">
          <CheckCircleIcon
            size={24}
            weight="fill"
            className="rounded-sm bg-black p-1 text-cyber-lime"
          />
          <span className="font-title-md text-xs font-bold uppercase text-on-surface">
            Generated Script Preview
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ScriptStats script={form.script} suffix=" read" />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="font-mono text-[11px] text-outline hover:text-error"
            onClick={() => update({ script: '' })}
          >
            Clear Script
          </Button>
        </div>
      </div>

      {form.visualConcept && (
        <Card variant="sunken" className="gap-0 rounded-md p-3">
          <span className="mb-1 block font-mono text-[11px] font-bold uppercase text-primary">
            🎬 AI Visual & Media Direction:
          </span>
          <p className="text-xs leading-relaxed text-on-surface">{form.visualConcept}</p>
        </Card>
      )}

      <div>
        <label
          htmlFor="generated-script-edit"
          className="mb-1.5 block font-mono text-[11px] uppercase text-outline"
        >
          Voiceover Narration (Editable):
        </label>
        <Textarea
          id="generated-script-edit"
          rows={6}
          value={form.script}
          onChange={(e) => update({ script: e.target.value })}
          className="min-h-32 resize-y px-4 py-3"
        />
      </div>
    </Card>
  )
}
