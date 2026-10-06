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
  'data-[state=on]:bg-ink-black data-[state=on]:text-cyber-lime dark:data-[state=on]:bg-surface-variant'

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
        'w-full overflow-hidden rounded-lg border-2 border-ink-black bg-paper-white dark:border-surface-variant dark:bg-surface-container-lowest',
        className
      )}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'h-11 flex-1 text-label-sm font-label-sm text-outline',
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
