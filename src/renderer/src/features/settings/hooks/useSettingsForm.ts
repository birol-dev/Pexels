import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
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
  /** Edits the typed key locally. Nothing is saved until `commitKey`. */
  setKey: (field: SecretKeyField, value: string) => void
  /** Saves a typed key. Called on Enter and when the field loses focus. */
  commitKey: (field: SecretKeyField, value: string) => void
  /** Asks first, then deletes the stored key. `label` is how the key is named in the dialog. */
  removeKey: (field: SecretKeyField, label: string) => Promise<void>
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
  const confirm = useAppStore((s) => s.confirm)

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

  /** Copies which keys are stored (masked or empty) from the store into the local draft. */
  const syncStoredKeys = useCallback((): void => {
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

  const onBatchSaved = useCallback(
    (batch: SettingsPatch): void => {
      // Clear password fields that were successfully persisted
      setKeys((prev) => {
        const next = { ...prev }
        for (const field of SECRET_FIELDS) {
          if (field in batch) next[field] = ''
        }
        return next
      })
      syncStoredKeys()
    },
    [syncStoredKeys]
  )

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

  // A key is saved when the user is done typing it, not on every keystroke: a half-typed
  // key would be written to the keychain and fail the next "Test Key".
  const setKey = useCallback((field: SecretKeyField, value: string): void => {
    setKeys((prev) => ({ ...prev, [field]: value }))
  }, [])

  const commitKey = useCallback(
    (field: SecretKeyField, value: string): void => {
      if (value.trim()) persistNow({ [field]: value })
    },
    [persistNow]
  )

  const removeKey = useCallback(
    async (field: SecretKeyField, label: string): Promise<void> => {
      const confirmed = await confirm(
        `Remove ${label} key`,
        `Delete the saved ${label} key from this computer? Jobs that need it will fail until you enter a new one.`,
        { confirmText: 'Remove key' }
      )
      if (!confirmed) return
      try {
        await updateSettings({ removeSecrets: [field] })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove the key.')
        return
      }
      setKeys((prev) => ({ ...prev, [field]: '' }))
      syncStoredKeys()
      toast.success(`${label} key removed.`)
    },
    [confirm, updateSettings, syncStoredKeys]
  )

  return { settings, keys, saving, setKey, commitKey, removeKey, update, updateNow }
}
