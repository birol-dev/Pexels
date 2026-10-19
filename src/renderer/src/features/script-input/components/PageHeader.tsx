import React from 'react'

export function PageHeader(): React.JSX.Element {
  return (
    <header>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        A new <em>pack</em>, <span className="text-fade">from a script or an idea</span>
      </h1>
      <p className="mt-4 max-w-xl text-body-lg text-outline">
        Paste a script and StockFinder finds Pexels footage for every beat. Or start from an idea
        and let AI write the script first.
      </p>
    </header>
  )
}
