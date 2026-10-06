import { useCallback, useState } from 'react'
import type { TestResult } from '../types'
import { errorMessage } from '../utils'

export interface ConnectionTest {
  testing: boolean
  result: TestResult | null
  run: () => Promise<void>
  reset: () => void
}

/** Wraps an async connection check with pending/result state and uniform error handling. */
export function useConnectionTest(
  check: () => Promise<TestResult>,
  fallbackMessage: string
): ConnectionTest {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const run = useCallback(async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await check())
    } catch (err) {
      setResult({ success: false, message: errorMessage(err, fallbackMessage) })
    } finally {
      setTesting(false)
    }
  }, [check, fallbackMessage])

  const reset = useCallback((): void => setResult(null), [])

  return { testing, result, run, reset }
}
