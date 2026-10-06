import { FolderIcon, FolderOpenIcon, FolderPlusIcon, InfoIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import type { OnboardingController } from '../hooks/useOnboarding'
import { FormPanel } from './FormPanel'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { StepNav } from './StepNav'

type StorageStepProps = Pick<OnboardingController, 'downloadFolder' | 'chooseFolder'> & {
  onBack: () => void
  onNext: () => void
}

export function StorageStep({
  downloadFolder,
  chooseFolder,
  onBack,
  onNext
}: StorageStepProps): React.JSX.Element {
  return (
    <StepCard>
      <StepHeader
        step={4}
        icon={FolderOpenIcon}
        title="Choose asset directory"
        description="Configure the local storage folder where StockFinder AI will download photos, videos, and project manifests."
      />

      <FormPanel className="gap-3 text-left">
        <Label
          htmlFor="onboarding-folder-path"
          className="pl-0.5 font-mono text-xs tracking-wider text-on-surface-variant uppercase"
        >
          Default Storage Path
        </Label>
        <div className="flex w-full flex-col items-stretch gap-4 sm:flex-row">
          <Button
            id="onboarding-folder-path"
            type="button"
            variant="outline"
            onClick={chooseFolder}
            className="h-auto grow justify-start gap-3 bg-input p-3 font-normal"
          >
            <FolderIcon size={20} className="text-outline" />
            <span className="truncate font-mono text-xs text-on-surface">
              {downloadFolder || 'Select a path...'}
            </span>
          </Button>

          <Button type="button" variant="secondary" onClick={chooseFolder} className="h-auto">
            <FolderPlusIcon />
            Choose Folder
          </Button>
        </div>

        <div className="mt-1 flex items-center gap-2 pl-1 text-outline">
          <InfoIcon size={16} />
          <span className="text-xs">Approximately 2.4GB of free space is recommended.</span>
        </div>
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
