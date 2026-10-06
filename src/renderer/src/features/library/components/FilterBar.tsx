import React from 'react'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { StatusFilter, TypeFilter } from '../types'

interface FilterBarProps {
  typeFilter: TypeFilter
  onTypeChange: (value: TypeFilter) => void
  statusFilter: StatusFilter
  onStatusChange: (value: StatusFilter) => void
  showStatus: boolean
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Videos' },
  { value: 'photo', label: 'Photos' }
]

export function FilterBar({
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  showStatus
}: FilterBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border-2 border-border bg-surface-container-low px-6 py-4">
      <ToggleGroup
        type="single"
        value={typeFilter}
        onValueChange={(value) => {
          // Radix emits '' when the active item is clicked again; keep the selection.
          if (value) onTypeChange(value as TypeFilter)
        }}
        aria-label="Filter by media type"
        className="rounded-md border-2 border-border bg-card p-1"
      >
        {TYPE_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="rounded-sm! font-label-sm text-xs uppercase data-[state=on]:bg-foreground data-[state=on]:font-bold data-[state=on]:text-primary dark:data-[state=on]:bg-primary dark:data-[state=on]:text-primary-foreground"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {showStatus && (
        <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: All</SelectItem>
            <SelectItem value="completed">Downloaded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
