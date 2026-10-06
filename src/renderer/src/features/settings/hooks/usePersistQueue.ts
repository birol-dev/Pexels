import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PERSIST_DEBOUNCE_MS, stripEmptySecrets, type SettingsPatch } from '../utils'

const SAVE_TOAST_ID = 'settings-save'

interface PersistQueueOptions {
  updateSettings: (updates: SettingsPatch) => Promise<void>
  /** Called after each batch has been persisted successfully. */
  onBatchSaved: (batch: SettingsPatch) => void
}

interface PersistQueue {
  saving: boolean
  schedulePersist: (partial: SettingsPatch) => void
  persistNow: (partial: SettingsPatch) => void
}

/** Debounced, serialized settings writer. Failed batches are re-queued, never dropped. */
export function usePersistQueue({
  updateSettings,
  onBatchSaved
}: PersistQueueOptions): PersistQueue {
  const [saving, setSaving] = useState(false)
  const pendingRef = useRef<SettingsPatch>({})
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushingRef = useRef(false)
  const mountedRef = useRef(true)
  const onBatchSavedRef = useRef(onBatchSaved)

  useEffect(() => {
    onBatchSavedRef.current = onBatchSaved
  }, [onBatchSaved])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [])

  const flushPersist = useCallback(async (): Promise<void> => {
    if (flushingRef.current) return
    flushingRef.current = true
    if (mountedRef.current) setSaving(true)
    let failed = false

    try {
      while (Object.keys(pendingRef.current).length > 0) {
        const batch = stripEmptySecrets({ ...pendingRef.current })
        pendingRef.current = {}

        if (Object.keys(batch).length === 0) continue

        try {
          await updateSettings(batch)
        } catch (err) {
          // Re-queue this batch ahead of any newer edits so nothing is lost
          pendingRef.current = { ...batch, ...pendingRef.current }
          failed = true
          const msg = err instanceof Error ? err.message : String(err)
          if (mountedRef.current) {
            toast.error(msg || 'Failed to save settings.', { id: SAVE_TOAST_ID })
          }
          break
        }

        onBatchSavedRef.current(batch)
        if (mountedRef.current) toast.success('Settings saved.', { id: SAVE_TOAST_ID })
      }
    } finally {
      flushingRef.current = false
      if (mountedRef.current) setSaving(false)
      // Drain edits that arrived during a successful flush; do not auto-retry failures
      if (!failed && Object.keys(pendingRef.current).length > 0) {
        void flushPersist()
      }
    }
  }, [updateSettings])

  const schedulePersist = useCallback(
    (partial: SettingsPatch): void => {
      pendingRef.current = { ...pendingRef.current, ...partial }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        void flushPersist()
      }, PERSIST_DEBOUNCE_MS)
    },
    [flushPersist]
  )

  const persistNow = useCallback(
    (partial: SettingsPatch): void => {
      pendingRef.current = { ...pendingRef.current, ...partial }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      void flushPersist()
    },
    [flushPersist]
  )

  return { saving, schedulePersist, persistNow }
}
