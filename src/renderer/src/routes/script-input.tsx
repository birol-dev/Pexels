import React from 'react'
import { CreatePackForm } from '@renderer/features/script-input/components/CreatePackForm'
import { PageHeader } from '@renderer/features/script-input/components/PageHeader'
import { RecentPacks } from '@renderer/features/script-input/components/RecentPacks'
import { SetupTray } from '@renderer/features/script-input/components/SetupTray'
import { useScriptInputBootstrap } from '@renderer/features/script-input/hooks/useScriptInputBootstrap'

export default function ScriptInputView(): React.JSX.Element {
  useScriptInputBootstrap()

  return (
    <div className="space-y-12">
      <PageHeader />
      <SetupTray />
      <CreatePackForm />
      <RecentPacks />
    </div>
  )
}
