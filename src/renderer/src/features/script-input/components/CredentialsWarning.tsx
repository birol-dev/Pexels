import React from 'react'
import { WarningIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useAppStore } from '@renderer/lib/store'
import { getActiveProvider, getMissingCredentials } from '../utils'

export function CredentialsWarning(): React.JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const navigate = useAppStore((s) => s.navigate)
  const missing = getMissingCredentials(settings)

  if (!missing) return null

  const provider = getActiveProvider(settings).toUpperCase()
  const pexels = <strong>Pexels API Key</strong>
  const llm = <strong>{provider} API Key</strong>

  return (
    <div
      role="alert"
      className="flex animate-pulse items-center justify-between gap-4 rounded-xl border-2 border-ink-black bg-tertiary-container p-4 font-label-sm text-xs text-on-tertiary-container shadow-hard"
    >
      <div className="flex items-center gap-3">
        <WarningIcon size={22} weight="fill" className="shrink-0" />
        <span>
          {missing === 'both' && (
            <>
              Credentials required: Configure both your {pexels} and active {llm} before generating
              packs.
            </>
          )}
          {missing === 'pexels' && (
            <>Credentials required: Configure your {pexels} before generating packs.</>
          )}
          {missing === 'llm' && (
            <>Credentials required: Configure your active {llm} before generating packs.</>
          )}
        </span>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => navigate('settings')}>
        Configure
      </Button>
    </div>
  )
}
