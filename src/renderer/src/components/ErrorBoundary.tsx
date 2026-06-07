import React from 'react'

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
          <div className="max-w-md text-center flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-[64px] text-error">error</span>
            <h1 className="font-headline-lg text-headline-lg text-paper-white uppercase">
              Something went wrong
            </h1>
            <p className="font-body-md text-body-md text-risograph-gray">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="btn-secondary rounded-DEFAULT px-6 py-3 mt-4"
            >
              <span className="font-label-sm text-label-sm uppercase">Try again</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
