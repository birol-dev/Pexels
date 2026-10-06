import { FolderIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api-client'
import type { PublicSettings } from '@renderer/lib/store'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsSection } from './SettingsSection'

interface StoragePanelProps {
  settings: PublicSettings
  form: SettingsForm
}

export function StoragePanel({ settings, form }: StoragePanelProps): React.JSX.Element {
  const handleChooseFolder = async (): Promise<void> => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) form.updateNow({ downloadFolder: folder })
  }

  return (
    <SettingsSection title="Storage Path" icon={FolderIcon} compact>
      <div className="flex items-center gap-3 rounded-md border-2 border-ink-black bg-surface-container-low p-2">
        <p
          className="flex-1 truncate px-2 font-mono text-sm text-foreground"
          title={settings.downloadFolder}
        >
          {settings.downloadFolder}
        </p>
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          onClick={handleChooseFolder}
          aria-label="Choose Folder"
        >
          <PencilSimpleIcon size={16} weight="bold" aria-hidden />
        </Button>
      </div>
    </SettingsSection>
  )
}
