import React from 'react'
import { countWords, estimateReadSeconds } from '../utils'

export function ScriptStats({
  script,
  suffix = ''
}: {
  script: string
  suffix?: string
}): React.JSX.Element {
  const words = countWords(script)
  return (
    <span className="font-mono text-xs font-bold text-primary">
      {words} words (~{estimateReadSeconds(words)}s{suffix})
    </span>
  )
}
