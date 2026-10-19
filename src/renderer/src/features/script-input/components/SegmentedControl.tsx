import React from 'react'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { cn } from '@renderer/lib/utils'

interface SegmentedControlProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  ariaLabel: string
  className?: string
  itemClassName?: string
  activeItemClassName?: string
}

const ACTIVE_DEFAULT =
  'data-[state=on]:bg-primary-container data-[state=on]:text-on-primary-container data-[state=on]:hover:bg-primary-container'

/** Single-select toggle group that never lets the selection become empty. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  itemClassName,
  activeItemClassName = ACTIVE_DEFAULT
}: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={ariaLabel}
      className={cn(
        'w-full gap-1 overflow-hidden rounded-full border border-control bg-input p-1',
        className
      )}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'h-9 flex-1 rounded-full text-[13px] font-medium text-on-surface-variant',
            activeItemClassName,
            itemClassName
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
