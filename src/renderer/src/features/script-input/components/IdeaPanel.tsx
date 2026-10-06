import React from 'react'
import type { FormSectionProps } from '../types'
import { IdeaInput } from './IdeaInput'
import { IdeaOptions } from './IdeaOptions'
import { ScriptGenerator } from './ScriptGenerator'

/** Idea-mode content: prompt, creative controls and AI script generation. */
export function IdeaPanel({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="animate-fade-in-up space-y-6">
      <IdeaInput form={form} update={update} />
      <IdeaOptions form={form} update={update} />
      <ScriptGenerator form={form} update={update} />
    </div>
  )
}
