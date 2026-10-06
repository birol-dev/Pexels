import React from 'react'
import { SEARCH_MODE_OPTIONS, type SearchMode } from '../constants'
import { FieldHint, FieldLabel } from './FieldLabel'
import { SegmentedControl } from './SegmentedControl'

interface SearchModePickerProps {
  value: SearchMode
  onChange: (mode: SearchMode) => void
}

export function SearchModePicker({ value, onChange }: SearchModePickerProps): React.JSX.Element {
  const current = SEARCH_MODE_OPTIONS.find((opt) => opt.value === value) ?? SEARCH_MODE_OPTIONS[0]

  return (
    <div className="pt-6">
      <FieldLabel id="search-mode-label">Search Mode</FieldLabel>
      <SegmentedControl
        value={value}
        onValueChange={onChange}
        options={SEARCH_MODE_OPTIONS}
        ariaLabel="Search Mode"
        className="h-12"
        itemClassName="h-full"
      />
      <FieldHint>{current.hint}</FieldHint>
    </div>
  )
}
