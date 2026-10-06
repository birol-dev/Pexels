import { ArrowSquareOutIcon, CodeIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { GITHUB_REPO_URL } from '../utils'

export function GithubCard(): React.JSX.Element {
  return (
    <Card className="flex-col gap-5 rounded-md border-2 border-ink-black p-6 shadow-hard sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md border-2 border-ink-black bg-surface-container-high">
          <CodeIcon size={22} weight="bold" aria-hidden />
        </div>
        <div>
          <h3 className="font-title-md text-[16px] font-bold uppercase tracking-wide text-foreground">
            Open source on GitHub
          </h3>
          <p className="font-body-md mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            StockFinder AI is built in public. Star the repo if it saves you a run, report a bug, or
            suggest a feature — your feedback shapes what ships next.
          </p>
        </div>
      </div>
      <Button asChild variant="secondary" size="lg" className="shrink-0 self-start sm:self-center">
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          <ArrowSquareOutIcon size={18} aria-hidden />
          <span className="font-label-sm text-label-sm uppercase">View on GitHub</span>
        </a>
      </Button>
    </Card>
  )
}
