import React from 'react'

export function PageHeader(): React.JSX.Element {
  return (
    <header>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        A new <em>pack</em>, <span className="text-fade">from a script or an idea</span>
      </h1>
    </header>
  )
}
