import React from 'react'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import type { FormSectionProps } from '../types'
import { ScriptStats } from './ScriptStats'

/** Editable preview of the AI-generated narration plus its visual direction. */
export function GeneratedScriptPreview({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="animate-fade-in-up space-y-4 rounded-xl border-2 border-ink-black bg-paper-white p-5 shadow-[4px_4px_0px_var(--color-ink-black)] dark:border-surface-variant dark:bg-surface-container-lowest">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink-black pb-3 dark:border-surface-variant">
        <div className="flex items-center gap-2">
          <CheckCircleIcon
            size={24}
            weight="fill"
            className="rounded bg-ink-black p-1 text-cyber-lime"
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
        <div className="rounded-lg border-2 border-ink-black bg-surface-container-low p-3 dark:border-surface-variant dark:bg-surface-container-lowest">
          <span className="mb-1 block font-mono text-[10px] font-bold uppercase text-primary dark:text-cyber-lime">
            🎬 AI Visual & Media Direction:
          </span>
          <p className="text-xs leading-relaxed text-on-surface">{form.visualConcept}</p>
        </div>
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
    </div>
  )
}
