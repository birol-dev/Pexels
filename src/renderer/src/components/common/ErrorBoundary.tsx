import React from 'react'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-frame p-8">
          <div className="flex max-w-md flex-col items-center rounded-3xl bg-background px-10 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-error-container text-on-error-container">
              <WarningCircleIcon size={28} />
            </span>
            <h1 className="mt-6 font-headline-lg text-[40px] leading-tight font-light text-on-surface">
              Something <em>went</em> wrong
            </h1>
            <p className="mt-3 text-sm text-outline">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <Button
              size="lg"
              className="mt-7"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              Try again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
