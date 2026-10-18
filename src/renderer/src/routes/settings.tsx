import React from 'react'
import { CheckIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { ActionsBar } from '@renderer/features/settings/components/ActionsBar'
import { AppearancePanel } from '@renderer/features/settings/components/AppearancePanel'
import { ExperimentalPanel } from '@renderer/features/settings/components/ExperimentalPanel'
import { GithubCard } from '@renderer/features/settings/components/GithubCard'
import { PerformancePanel } from '@renderer/features/settings/components/PerformancePanel'
import { PexelsPanel } from '@renderer/features/settings/components/PexelsPanel'
import { ProviderPanel } from '@renderer/features/settings/components/ProviderPanel'
import { SafetyPanel } from '@renderer/features/settings/components/SafetyPanel'
import { SettingsMenu } from '@renderer/features/settings/components/SettingsMenu'
import { StoragePanel } from '@renderer/features/settings/components/StoragePanel'
import { UpdatesPanel } from '@renderer/features/settings/components/UpdatesPanel'
import { useSettingsForm } from '@renderer/features/settings/hooks/useSettingsForm'

export default function SettingsView(): React.JSX.Element {
  const form = useSettingsForm()
  const { settings } = form

  if (!settings) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <CircleNotchIcon size={40} className="animate-spin text-outline" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            Settings<span className="text-fade">, saved as you go</span>
          </h1>
          <p className="mt-4 max-w-xl text-body-lg text-outline">
            Keys, where packs are saved, and how a run behaves.
          </p>
        </div>
        <span
          role="status"
          className="flex h-8 items-center gap-2 rounded-full bg-surface-container px-3.5 text-[13px] text-on-surface-variant"
        >
          {form.saving ? (
            <CircleNotchIcon size={14} className="animate-spin" aria-hidden />
          ) : (
            <CheckIcon size={14} aria-hidden />
          )}
          {form.saving ? 'Saving…' : 'All changes saved'}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="lg:relative">
          <SettingsMenu />
        </div>
        <div className="flex max-w-[720px] min-w-0 flex-col gap-14">
          <ProviderPanel settings={settings} form={form} />
          <PexelsPanel settings={settings} form={form} />
          <StoragePanel settings={settings} form={form} />
          <AppearancePanel settings={settings} form={form} />
          <SafetyPanel settings={settings} form={form} />
          <PerformancePanel settings={settings} form={form} />
          <ExperimentalPanel settings={settings} form={form} />
          <UpdatesPanel settings={settings} form={form} />
          <ActionsBar />
          <GithubCard />
        </div>
      </div>
    </div>
  )
}
