import { useCallback, useEffect, useState } from 'react'
import { useAppStore, type PublicSettings } from '@renderer/lib/store'
import { usePersistQueue } from './usePersistQueue'
import {
  EMPTY_SECRET_KEYS,
  SECRET_FIELDS,
  type SecretKeyField,
  type SecretKeys,
  type SettingsPatch
} from '../utils'

export interface SettingsForm {
  settings: PublicSettings | null
  /** Plaintext keys typed this session (blank = leave stored key unchanged). */
  keys: SecretKeys
  saving: boolean
  setKey: (field: SecretKeyField, value: string) => void
  /** Update locally and persist after the debounce window. */
  update: (partial: SettingsPatch) => void
  /** Update locally and persist immediately. */
  updateNow: (partial: SettingsPatch) => void
}

/** Local draft of the settings plus the persistence wiring for it. */
export function useSettingsForm(): SettingsForm {
  const storeSettings = useAppStore((s) => s.settings)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [keys, setKeys] = useState<SecretKeys>(EMPTY_SECRET_KEYS)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Drive UI from local state. Initialize once; do not merge global settings back
  // into local on every persist (would fight in-progress edits).
  useEffect(() => {
    if (storeSettings && !initialized) {
      Promise.resolve().then(() => {
        setSettings({ ...storeSettings })
        setInitialized(true)
      })
    }
  }, [storeSettings, initialized])

  const onBatchSaved = useCallback((batch: SettingsPatch): void => {
    // Clear password fields that were successfully persisted
    setKeys((prev) => {
      const next = { ...prev }
      for (const field of SECRET_FIELDS) {
        if (field in batch) next[field] = ''
      }
      return next
    })
    const latest = useAppStore.getState().settings
    if (!latest) return
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            openaiKey: latest.openaiKey,
            geminiKey: latest.geminiKey,
            openrouterKey: latest.openrouterKey,
            pexelsKey: latest.pexelsKey
          }
        : prev
    )
  }, [])

  const { saving, schedulePersist, persistNow } = usePersistQueue({ updateSettings, onBatchSaved })

  const patchLocal = useCallback((partial: SettingsPatch): void => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : null))
  }, [])

  const update = useCallback(
    (partial: SettingsPatch): void => {
      patchLocal(partial)
      schedulePersist(partial)
    },
    [patchLocal, schedulePersist]
  )

  const updateNow = useCallback(
    (partial: SettingsPatch): void => {
      patchLocal(partial)
      persistNow(partial)
    },
    [patchLocal, persistNow]
  )

  const setKey = useCallback(
    (field: SecretKeyField, value: string): void => {
      setKeys((prev) => ({ ...prev, [field]: value }))
      schedulePersist({ [field]: value })
    },
    [schedulePersist]
  )

  return { settings, keys, saving, setKey, update, updateNow }
}
