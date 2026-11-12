import { CircleNotchIcon } from '@phosphor-icons/react'
import { McpPanel } from '@renderer/features/settings/components/McpPanel'
import { useSettingsForm } from '@renderer/features/settings/hooks/useSettingsForm'

export default function McpView(): React.JSX.Element {
  const form = useSettingsForm()
  if (!form.settings)
    return (
      <CircleNotchIcon className="mx-auto my-20 animate-spin" size={32} aria-label="Loading MCP" />
    )
  return <McpPanel settings={form.settings} form={form} />
}
