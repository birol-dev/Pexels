import { ShieldCheckIcon } from '@phosphor-icons/react'
import type { PublicSettings } from '@renderer/lib/store'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsSection } from './SettingsSection'
import { ToggleRow } from './ToggleRow'

interface SafetyPanelProps {
  settings: PublicSettings
  form: SettingsForm
}

export function SafetyPanel({ settings, form }: SafetyPanelProps): React.JSX.Element {
  const { updateNow } = form

  return (
    <SettingsSection title="Safety Controls" icon={ShieldCheckIcon} compact className="flex-1">
      <div className="mt-2 flex flex-col gap-4">
        <ToggleRow
          id="skip-explicit"
          label="Skip explicit content"
          description="Blocks explicit search terms and hides results described as explicit. Best effort."
          checked={settings.skipExplicitQueries}
          onCheckedChange={(skipExplicitQueries) => updateNow({ skipExplicitQueries })}
        />
        <ToggleRow
          id="avoid-people"
          label="Avoid people & faces"
          description="Hides results whose description mentions people. Best effort: videos are judged by their title only."
          checked={settings.avoidPeopleAndFaces}
          onCheckedChange={(avoidPeopleAndFaces) => updateNow({ avoidPeopleAndFaces })}
        />
        <ToggleRow
          id="require-approval"
          label="Require approval before download"
          description="Pause before downloads"
          checked={settings.requireApprovalBeforeDownload}
          onCheckedChange={(requireApprovalBeforeDownload) =>
            updateNow({ requireApprovalBeforeDownload })
          }
        />
        <ToggleRow
          id="hide-cost"
          label="Hide token usage"
          description="Do not show token counts on the Run screen"
          checked={settings.hideEstimatedCost || false}
          onCheckedChange={(hideEstimatedCost) => updateNow({ hideEstimatedCost })}
        />
      </div>
    </SettingsSection>
  )
}
