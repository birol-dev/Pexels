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
    <SettingsSection
      id="settings-safety"
      title="Safety"
      description="What a run may search for, and when it stops to ask you."
    >
      <div className="flex flex-col gap-5">
        <ToggleRow
          id="skip-explicit"
          label="Skip explicit content"
          description="Blocks explicit search terms and hides results described as explicit. Best effort."
          checked={settings.skipExplicitQueries}
          onCheckedChange={(skipExplicitQueries) => updateNow({ skipExplicitQueries })}
        />
        <ToggleRow
          id="avoid-people"
          label="Avoid people and faces"
          description="Hides results whose description mentions people. Best effort: videos are judged by their title only."
          checked={settings.avoidPeopleAndFaces}
          onCheckedChange={(avoidPeopleAndFaces) => updateNow({ avoidPeopleAndFaces })}
        />
        <ToggleRow
          id="require-approval"
          label="Require approval before download"
          description="The run pauses so you can pick the shots before anything downloads."
          checked={settings.requireApprovalBeforeDownload}
          onCheckedChange={(requireApprovalBeforeDownload) =>
            updateNow({ requireApprovalBeforeDownload })
          }
        />
        <ToggleRow
          id="hide-cost"
          label="Hide token usage"
          description="Leaves the token counts off the Run screen."
          checked={settings.hideEstimatedCost || false}
          onCheckedChange={(hideEstimatedCost) => updateNow({ hideEstimatedCost })}
        />
      </div>
    </SettingsSection>
  )
}
