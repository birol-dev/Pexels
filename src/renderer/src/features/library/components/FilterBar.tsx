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
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        type="single"
        value={typeFilter}
        onValueChange={(value) => {
          // Radix emits '' when the active item is clicked again; keep the selection.
          if (value) onTypeChange(value as TypeFilter)
        }}
        aria-label="Filter by media type"
        className="gap-0.5 rounded-full bg-surface-container p-1"
      >
        {TYPE_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="h-8 rounded-full! px-4 text-[13px] text-on-surface-variant data-[state=on]:bg-background data-[state=on]:text-on-surface data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.06)] dark:data-[state=on]:bg-surface-container-highest"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {showStatus && (
        <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger
            className="w-40 border-transparent bg-surface-container data-[size=default]:h-10"
            aria-label="Filter by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="completed">Downloaded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
