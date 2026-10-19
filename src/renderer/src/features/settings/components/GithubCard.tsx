import { ArrowUpRightIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { GITHUB_REPO_URL } from '../utils'

export function GithubCard(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-surface-container-low p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-background">
          <GithubLogoIcon size={22} aria-hidden />
        </div>
        <div>
          <h3 className="text-base font-semibold text-on-surface">Open source on GitHub</h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-outline">
            StockFinder AI is built in public. Star the repo if it saves you a run, report a bug, or
            suggest a feature. Your feedback shapes what ships next.
          </p>
        </div>
      </div>
      <Button
        asChild
        variant="secondary"
        className="shrink-0 self-start bg-background sm:self-center"
      >
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          View on GitHub
          <ArrowUpRightIcon size={16} aria-hidden />
        </a>
      </Button>
    </div>
  )
}
