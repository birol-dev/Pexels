import { FolderIcon } from '@phosphor-icons/react'
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
        title={
          <>
            Where <span className="text-fade">should packs</span> <em>live</em>?
          </>
        }
        description="Each pack gets its own folder here, with its photos, clips and a manifest of credits."
      />

      <FormPanel className="gap-2.5">
        <Label htmlFor="onboarding-folder-path" className="text-[13px] font-medium text-on-surface">
          Download folder
        </Label>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container py-2 pr-2 pl-4">
          <FolderIcon size={20} className="shrink-0 text-outline" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-on-surface">
            {downloadFolder || 'No folder chosen yet'}
          </span>
          <Button
            id="onboarding-folder-path"
            type="button"
            size="sm"
            variant="secondary"
            className="bg-background hover:bg-background/70"
            onClick={chooseFolder}
          >
            {downloadFolder ? 'Change' : 'Choose'}
          </Button>
        </div>
        <p className="text-[13px] text-outline">A few gigabytes of free space is plenty.</p>
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
