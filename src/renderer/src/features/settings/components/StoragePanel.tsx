import { FolderIcon } from '@phosphor-icons/react'
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
    <SettingsSection
      id="settings-storage"
      title="Storage"
      description="Each pack gets its own folder in here."
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface-container py-2 pr-2 pl-4">
        <FolderIcon size={20} className="shrink-0 text-outline" aria-hidden />
        <p
          className="min-w-0 flex-1 truncate font-mono text-[13px] text-on-surface"
          title={settings.downloadFolder}
        >
          {settings.downloadFolder || 'No folder chosen yet'}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-background hover:bg-background/70"
          onClick={handleChooseFolder}
          aria-label="Choose Folder"
        >
          Change
        </Button>
      </div>
    </SettingsSection>
  )
}
