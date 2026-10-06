import { useCallback } from 'react'
import { useAppStore, type InputFormState } from '@renderer/lib/store'
import { getActiveProvider, getActiveProviderKey } from '../utils'

/** Validates credentials, then asks the store to expand the idea into a script. */
export function useExpandIdea(form: InputFormState): () => Promise<void> {
  const settings = useAppStore((s) => s.settings)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const alert = useAppStore((s) => s.alert)
  const navigate = useAppStore((s) => s.navigate)
  const expandIdea = useAppStore((s) => s.expandIdea)
  const idea = form.idea

  return useCallback(async (): Promise<void> => {
    if (!idea.trim()) {
      await alert(
        'Idea Required',
        'Please enter a short concept, prompt, or outline for your video.'
      )
      return
    }

    if (!getActiveProviderKey(settings)) {
      await alert(
        'Credentials Required',
        `Active LLM Provider (${getActiveProvider(settings).toUpperCase()}) API Key is missing. Please set it in Settings first.`
      )
      navigate('settings')
      return
    }

    try {
      await expandIdea(activeTabId)
    } catch (err) {
      await alert(
        'AI Script Expansion Failed',
        err instanceof Error ? err.message : 'Could not expand idea into a script.'
      )
    }
  }, [idea, settings, activeTabId, alert, navigate, expandIdea])
}
