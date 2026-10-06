import React from 'react'
import { QuestionIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useAppStore } from '@renderer/lib/store'

export function PageHeader(): React.JSX.Element {
  const navigate = useAppStore((s) => s.navigate)

  return (
    <header className="mb-section-gap flex items-end justify-between">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Create New Pack</h2>
        <p className="font-body-lg text-body-lg text-outline mt-2">
          Paste a full script or enter a raw idea — AI will write the narrative and curate matching
          b-roll.
        </p>
      </div>
      <Button
        variant="secondary"
        size="icon-lg"
        className="rounded-full"
        onClick={() => navigate('settings')}
        aria-label="Help & Settings"
        title="Help & Settings"
      >
        <QuestionIcon size={20} weight="bold" />
      </Button>
    </header>
  )
}
