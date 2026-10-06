import React from 'react'
import { Card } from '@renderer/components/ui/card'
import { useInputTabForm } from '../hooks/useInputTabForm'
import { useStartJob } from '../hooks/useStartJob'
import { AssetMixPicker } from './AssetMixPicker'
import { IdeaPanel } from './IdeaPanel'
import { InputModeSwitch } from './InputModeSwitch'
import { LimitsFields } from './LimitsFields'
import { PlatformPicker } from './PlatformPicker'
import { ProjectTitleField } from './ProjectTitleField'
import { ScriptEditor } from './ScriptEditor'
import { SearchModePicker } from './SearchModePicker'
import { StylePicker } from './StylePicker'
import { SubmitBar } from './SubmitBar'

export function CreatePackForm(): React.JSX.Element {
  const { form, update } = useInputTabForm()
  const handleSubmit = useStartJob(form)

  return (
    <Card className="max-w-5xl gap-0 rounded-xl border-2 border-ink-black p-component-padding shadow-none dark:border-surface-variant">
      <form onSubmit={handleSubmit} className="space-y-8">
        <InputModeSwitch value={form.inputMode} onChange={(inputMode) => update({ inputMode })} />
        <ProjectTitleField form={form} update={update} />

        {form.inputMode === 'script' ? (
          <ScriptEditor form={form} update={update} />
        ) : (
          <IdeaPanel form={form} update={update} />
        )}

        <div className="grid grid-cols-1 gap-gutter pt-2 md:grid-cols-3">
          <PlatformPicker value={form.platform} onChange={(platform) => update({ platform })} />
          <StylePicker form={form} update={update} />
          <AssetMixPicker value={form.mix} onChange={(mix) => update({ mix })} />
        </div>

        <SearchModePicker
          value={form.searchMode}
          onChange={(searchMode) => update({ searchMode })}
        />
        <LimitsFields form={form} update={update} />
        <SubmitBar form={form} />
      </form>
    </Card>
  )
}
