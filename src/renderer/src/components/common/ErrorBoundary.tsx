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
        <div className="flex h-screen items-center justify-center bg-black p-8">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <WarningCircleIcon size={64} className="text-error" />
            <h1 className="font-headline-lg text-headline-lg uppercase text-white">
              Something went wrong
            </h1>
            <p className="font-body-md text-body-md text-risograph-gray">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-4 uppercase"
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
