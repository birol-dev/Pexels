import React from 'react'
import { SparkleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { QUICK_IDEA_STARTERS } from '../constants'
import type { FormSectionProps } from '../types'
import { starterTitle } from '../utils'
import { FieldLabel } from './FieldLabel'

export function IdeaInput({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <FieldLabel htmlFor="video-idea" className="mb-0">
          Video Idea / Topic / Hook
        </FieldLabel>
        <span className="font-label-sm text-xs text-outline">
          Short premise, bullet points, or topic
        </span>
      </div>
      <Textarea
        id="video-idea"
        rows={4}
        placeholder="e.g. 5 mind-blowing psychological facts that explain why we procrastinate, with dramatic hooks and everyday examples..."
        value={form.idea}
        onChange={(e) => update({ idea: e.target.value })}
        className="min-h-24 resize-y px-4 py-3"
        required={!form.script.trim()}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1 font-mono text-[11px] font-bold uppercase text-outline">
          <SparkleIcon size={14} />
          Inspirations:
        </span>
        {QUICK_IDEA_STARTERS.map((starter) => (
          <Button
            key={starter.label}
            type="button"
            variant="secondary"
            size="xs"
            onClick={() =>
              update({
                idea: starter.prompt,
                ...(form.title.trim() ? {} : { title: starterTitle(starter.label) })
              })
            }
          >
            {starter.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
