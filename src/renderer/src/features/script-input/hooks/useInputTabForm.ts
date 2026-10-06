import { useCallback, useMemo } from 'react'
import { useAppStore, type InputFormState } from '@renderer/lib/store'
import { DEFAULT_FORM_STATE } from '../constants'

export interface InputTabForm {
  form: InputFormState
  update: (patch: Partial<InputFormState>) => void
}

/** Reads the active tab's form state (with defaults applied) and exposes a patch updater. */
export function useInputTabForm(): InputTabForm {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const stored = useAppStore((s) => s.inputTabStates[activeTabId])
  const updateInputTabState = useAppStore((s) => s.updateInputTabState)

  const form = useMemo<InputFormState>(() => {
    if (!stored) return DEFAULT_FORM_STATE
    return {
      ...stored,
      inputMode: stored.inputMode ?? 'script',
      idea: stored.idea ?? '',
      targetDuration: stored.targetDuration ?? '60s',
      tone: stored.tone ?? 'Engaging & Hook-first',
      visualConcept: stored.visualConcept ?? '',
      isExpandingIdea: stored.isExpandingIdea ?? false,
      searchMode: stored.searchMode ?? 'focused'
    }
  }, [stored])

  const update = useCallback(
    (patch: Partial<InputFormState>): void => updateInputTabState(activeTabId, patch),
    [updateInputTabState, activeTabId]
  )

  return { form, update }
}
