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
    <span className="text-[13px] font-medium tabular-nums text-on-surface">
      {words} words (~{estimateReadSeconds(words)}s{suffix})
    </span>
  )
}
