import { useCallback, useEffect, useState } from 'react'
import type { ApprovalSelection } from '../utils'

interface AssetApproval {
  selection: ApprovalSelection
  approve: (assetId: string) => void
  reject: (assetId: string) => void
  approveAll: () => void
  rejectAll: (assetIds: string[]) => void
}

/** Per-asset approval choices; anything not explicitly rejected counts as approved. */
export function useAssetApproval(jobId: string | null): AssetApproval {
  const [selection, setSelection] = useState<ApprovalSelection>({})

  useEffect(() => {
    Promise.resolve().then(() => {
      setSelection({})
    })
  }, [jobId])

  const approve = useCallback((assetId: string): void => {
    setSelection((current) => ({ ...current, [assetId]: true }))
  }, [])
  const reject = useCallback((assetId: string): void => {
    setSelection((current) => ({ ...current, [assetId]: false }))
  }, [])
  const approveAll = useCallback((): void => setSelection({}), [])
  const rejectAll = useCallback((assetIds: string[]): void => {
    setSelection(Object.fromEntries(assetIds.map((id) => [id, false])))
  }, [])

  return { selection, approve, reject, approveAll, rejectAll }
}
