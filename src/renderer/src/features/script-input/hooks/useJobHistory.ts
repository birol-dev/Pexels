import { useAppStore, type JobSummary } from '@renderer/lib/store'

export interface JobHistory {
  jobs: JobSummary[]
  loading: boolean
  openJob: (jobId: string) => void
  rerunJob: (jobId: string) => Promise<void>
  deleteJob: (jobId: string, jobTitle: string) => Promise<void>
}

export function useJobHistory(): JobHistory {
  const jobs = useAppStore((s) => s.jobs)
  const loading = useAppStore((s) => s.loading)
  const setActiveJobId = useAppStore((s) => s.setActiveJobId)
  const navigate = useAppStore((s) => s.navigate)
  const rerunJob = useAppStore((s) => s.rerunJob)
  const removeJob = useAppStore((s) => s.deleteJob)
  const alert = useAppStore((s) => s.alert)
  const confirm = useAppStore((s) => s.confirm)

  const openJob = (jobId: string): void => {
    setActiveJobId(jobId)
    navigate('run')
  }

  const deleteJob = async (jobId: string, jobTitle: string): Promise<void> => {
    const isConfirmed = await confirm(
      'Delete Project',
      `Delete the project "${jobTitle}"?\n\nIts folder, with every downloaded photo and video and the run log, moves to the trash. You can restore it from there if you change your mind.`,
      { confirmText: 'Move to trash' }
    )
    if (!isConfirmed) return
    try {
      await removeJob(jobId)
    } catch (err) {
      await alert('Error Deleting Project', 'Failed to delete project: ' + err)
    }
  }

  return { jobs, loading, openJob, rerunJob, deleteJob }
}
