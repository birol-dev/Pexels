import React, { useCallback } from 'react'
import { useAppStore, type InputFormState } from '@renderer/lib/store'
import {
  describeMissingCredentials,
  getActiveProvider,
  getMissingCredentials,
  resolveFinalTitle
} from '../utils'

/** Form submit handler: validates the form and credentials, then starts the job. */
export function useStartJob(form: InputFormState): (e: React.FormEvent) => Promise<void> {
  const settings = useAppStore((s) => s.settings)
  const startJob = useAppStore((s) => s.startJob)
  const alert = useAppStore((s) => s.alert)
  const navigate = useAppStore((s) => s.navigate)

  return useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const { title, script, inputMode, idea } = form

      if (inputMode === 'script') {
        if (!title.trim() || !script.trim()) {
          await alert(
            'Validation Error',
            'Please fill out both the project title and the video script.'
          )
          return
        }
      } else if (!idea.trim() && !script.trim()) {
        await alert('Validation Error', 'Please enter your video idea or topic.')
        return
      }

      const missing = getMissingCredentials(settings)
      if (missing) {
        const message = describeMissingCredentials(missing, getActiveProvider(settings))
        await alert('Credentials Required', `${message} Please set it in Settings first.`)
        navigate('settings')
        return
      }

      try {
        await startJob({
          title: resolveFinalTitle(title, idea),
          script: script.trim(),
          inputMode,
          idea: idea.trim(),
          targetDuration: form.targetDuration,
          tone: form.tone,
          visualConcept: form.visualConcept,
          platform: form.platform,
          style: form.style,
          mix: form.mix,
          maxAssetsPerBeat: form.maxAssetsPerBeat,
          maxTotalDownloads: form.maxTotalDownloads,
          searchMode: form.searchMode
        })
      } catch (err) {
        await alert(
          'Failed to Start Project',
          err instanceof Error ? err.message : 'Could not create the project workspace.'
        )
      }
    },
    [form, settings, startJob, alert, navigate]
  )
}
