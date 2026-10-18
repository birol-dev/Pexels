import React from 'react'
import { FileTextIcon, LightbulbIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import type { InputMode } from '../constants'
import { FieldLabel } from './FieldLabel'
import { SegmentedControl } from './SegmentedControl'

interface InputModeSwitchProps {
  value: InputMode
  onChange: (mode: InputMode) => void
}

const MODE_OPTIONS: { value: InputMode; label: React.ReactNode }[] = [
  {
    value: 'script',
    label: (
      <>
        <FileTextIcon size={18} />
        <span>I have a script</span>
      </>
    )
  },
  {
    value: 'idea',
    label: (
      <>
        <LightbulbIcon size={18} />
        <span>Start from an idea</span>
        <Badge className="h-5 bg-on-surface/8 px-2 text-[11px] text-current in-data-[state=on]:bg-on-primary-container/15">
          AI writes it
        </Badge>
      </>
    )
  }
]

export function InputModeSwitch({ value, onChange }: InputModeSwitchProps): React.JSX.Element {
  return (
    <div>
      <FieldLabel id="input-mode-label">Input</FieldLabel>
      <SegmentedControl
        value={value}
        onValueChange={onChange}
        options={MODE_OPTIONS}
        ariaLabel="Input Mode"
        itemClassName="h-10 gap-2 text-sm"
      />
    </div>
  )
}
