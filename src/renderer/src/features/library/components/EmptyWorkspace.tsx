import React from 'react'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Button } from '@renderer/components/ui/button'

export function EmptyWorkspace({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div className="animate-fade-in-up flex flex-col gap-10">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        Media <em>library</em>
      </h1>
      <EmptyState
        className="py-20"
        title="Nothing downloaded yet"
        description="Every photo and clip a pack downloads lands here, grouped by project."
        action={<Button onClick={onBack}>Create a pack</Button>}
        secondary={
          <Button asChild variant="link" className="px-0">
            <a href="https://www.pexels.com/license/" target="_blank" rel="noreferrer">
              How the Pexels license works
            </a>
          </Button>
        }
      />
    </div>
  )
}
