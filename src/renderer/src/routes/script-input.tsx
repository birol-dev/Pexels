import React from 'react'
import { CreatePackForm } from '@renderer/features/script-input/components/CreatePackForm'
import { CredentialsWarning } from '@renderer/features/script-input/components/CredentialsWarning'
import { PageHeader } from '@renderer/features/script-input/components/PageHeader'
import { RunHistory } from '@renderer/features/script-input/components/RunHistory'
import { useScriptInputBootstrap } from '@renderer/features/script-input/hooks/useScriptInputBootstrap'

export default function ScriptInputView(): React.JSX.Element {
  useScriptInputBootstrap()

  return (
    <div className="space-y-8">
      <PageHeader />
      <CredentialsWarning />
      <CreatePackForm />
      <RunHistory />
    </div>
  )
}
