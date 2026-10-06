import React from 'react'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { ActionsBar } from '@renderer/features/settings/components/ActionsBar'
import { AppearancePanel } from '@renderer/features/settings/components/AppearancePanel'
import { GithubCard } from '@renderer/features/settings/components/GithubCard'
import { PerformancePanel } from '@renderer/features/settings/components/PerformancePanel'
import { PexelsPanel } from '@renderer/features/settings/components/PexelsPanel'
import { ProviderPanel } from '@renderer/features/settings/components/ProviderPanel'
import { SafetyPanel } from '@renderer/features/settings/components/SafetyPanel'
import { StoragePanel } from '@renderer/features/settings/components/StoragePanel'
import { useSettingsForm } from '@renderer/features/settings/hooks/useSettingsForm'

export default function SettingsView(): React.JSX.Element {
  const form = useSettingsForm()
  const { settings } = form

  if (!settings) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <CircleNotchIcon size={48} className="animate-spin text-cyber-lime" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1160px] animate-fade-in-up flex-col gap-8 px-grid-margin py-8">
      <header className="mb-4">
        <h2 className="font-headline-lg text-headline-lg uppercase leading-none text-foreground">
          Settings
        </h2>
        <p className="font-body-lg text-body-lg mt-3 max-w-2xl text-muted-foreground">
          Configure generation parameters, API keys, and safety controls for the core engine.
          Changes apply automatically.
          {form.saving && <span className="ml-2 font-bold text-secondary">Saving…</span>}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
        <ProviderPanel settings={settings} form={form} className="md:col-span-8" />
        <PexelsPanel settings={settings} form={form} className="md:col-span-4" />
        <PerformancePanel settings={settings} form={form} className="md:col-span-7" />
        <div className="flex flex-col gap-gutter md:col-span-5">
          <StoragePanel settings={settings} form={form} />
          <AppearancePanel settings={settings} form={form} />
          <SafetyPanel settings={settings} form={form} />
        </div>
        <div className="md:col-span-12">
          <ActionsBar />
        </div>
      </div>

      <GithubCard />
    </div>
  )
}
