import React from 'react'
import { Input } from '@renderer/components/ui/input'
import type { FormSectionProps } from '../types'
import { FieldLabel } from './FieldLabel'

export function ProjectTitleField({ form, update }: FormSectionProps): React.JSX.Element {
  const isIdeaMode = form.inputMode === 'idea'

  return (
    <div>
      <FieldLabel htmlFor="project-title">
        <span>
          Project Title{' '}
          {isIdeaMode && (
            <span className="font-normal lowercase text-outline">
              (optional — AI will generate one if blank)
            </span>
          )}
        </span>
      </FieldLabel>
      <Input
        id="project-title"
        type="text"
        placeholder={
          isIdeaMode
            ? 'e.g. 5 Deep Sea Monsters, Why We Procrastinate (or leave blank)'
            : 'e.g. Q3 Marketing Explainer, AI Office Hacks'
        }
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        className="h-12 px-4"
        required={!isIdeaMode}
      />
    </div>
  )
}
