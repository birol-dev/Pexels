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
        <span>Full Script Mode</span>
      </>
    )
  },
  {
    value: 'idea',
    label: (
      <>
        <LightbulbIcon size={18} />
        <span>Idea / Concept Mode</span>
        <Badge className="rounded bg-ink-black px-1.5 font-mono text-[10px] font-bold tracking-tight text-cyber-lime">
          AI WRITER
        </Badge>
      </>
    )
  }
]

export function InputModeSwitch({ value, onChange }: InputModeSwitchProps): React.JSX.Element {
  return (
    <div>
      <FieldLabel id="input-mode-label">Input Mode</FieldLabel>
      <SegmentedControl
        value={value}
        onValueChange={onChange}
        options={MODE_OPTIONS}
        ariaLabel="Input Mode"
        className="gap-2 p-1.5 border-2"
        itemClassName="h-12 rounded-lg font-title-md text-xs font-bold uppercase tracking-wider"
        activeItemClassName="data-[state=on]:bg-cyber-lime data-[state=on]:text-ink-black"
      />
    </div>
  )
}
