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
    <Card variant="sunken" className="animate-fade-in-up gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircleIcon size={20} weight="fill" className="text-on-surface" />
          <span className="text-sm font-semibold text-on-surface">Your script</span>
        </div>
        <div className="flex items-center gap-3">
          <ScriptStats script={form.script} suffix=" read" />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-outline hover:text-error"
            onClick={() => update({ script: '' })}
          >
            Clear
          </Button>
        </div>
      </div>

      {form.visualConcept && (
        <div className="rounded-2xl bg-surface-container p-4">
          <span className="mb-1 block text-[13px] font-medium text-on-surface">
            Visual direction
          </span>
          <p className="text-[13px] leading-relaxed text-on-surface-variant">
            {form.visualConcept}
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="generated-script-edit"
          className="mb-2 block text-[13px] font-medium text-on-surface"
        >
          Narration <span className="font-normal text-outline">(edit freely)</span>
        </label>
        <Textarea
          id="generated-script-edit"
          rows={6}
          value={form.script}
          onChange={(e) => update({ script: e.target.value })}
          className="min-h-32 resize-y"
        />
      </div>
    </Card>
  )
}
