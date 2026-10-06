import { useCallback, useState } from 'react'
import type { TestResultState } from '../utils'

interface ConnectionTest {
  testing: boolean
  result: TestResultState | null
  run: () => Promise<void>
  reset: () => void
}

/** Runs an async connection check and tracks its pending/result state. */
export function useConnectionTest(
  check: () => Promise<TestResultState>,
  fallbackMessage: string
): ConnectionTest {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResultState | null>(null)

  const run = useCallback(async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await check())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setResult({ success: false, message: msg || fallbackMessage })
    } finally {
      setTesting(false)
    }
  }, [check, fallbackMessage])

  const reset = useCallback((): void => setResult(null), [])

  return { testing, result, run, reset }
}
