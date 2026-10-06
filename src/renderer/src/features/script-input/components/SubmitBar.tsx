import React from 'react'
import { DownloadSimpleIcon, SparkleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useAppStore } from '@renderer/lib/store'
import type { FormSectionProps } from '../types'

export function SubmitBar({ form }: Pick<FormSectionProps, 'form'>): React.JSX.Element {
  const loading = useAppStore((s) => s.loading)
  const generatesScript = form.inputMode === 'idea' && !form.script.trim()
  const SubmitIcon = generatesScript ? SparkleIcon : DownloadSimpleIcon

  return (
    <div className="mt-section-gap flex justify-end border-t-2 border-dashed border-ink-black pt-8 dark:border-surface-variant">
      <Button
        type="submit"
        size="lg"
        disabled={loading || !!form.isExpandingIdea}
        className="h-14 gap-3 px-8 uppercase tracking-wider"
      >
        <SubmitIcon size={20} weight="bold" />
        {loading
          ? 'Starting Pipeline…'
          : generatesScript
            ? 'Generate Script & Fetch Visual Assets'
            : 'Analyze & Fetch Visual Assets'}
      </Button>
    </div>
  )
}
