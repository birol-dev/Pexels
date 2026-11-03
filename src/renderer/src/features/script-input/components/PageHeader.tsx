import React from 'react'
import { useAppStore } from '@renderer/lib/store'

export function PageHeader(): React.JSX.Element {
  const isMcp = useAppStore((s) => s.settings?.agentEngine === 'mcp')
  return (
    <header>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        A new <em>pack</em>, <span className="text-fade">from a script or an idea</span>
      </h1>
      <p className="mt-4 max-w-xl text-body-lg text-outline">
        {isMcp
          ? 'Create a pack from your script or idea, then ask your connected AI app to plan the beats and find Pexels footage through MCP.'
          : 'Paste a script and StockFinder finds Pexels footage for every beat. Or start from an idea and let AI write the script first.'}
      </p>
    </header>
  )
}
