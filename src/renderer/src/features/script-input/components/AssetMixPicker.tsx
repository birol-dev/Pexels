import React from 'react'
import { MIX_OPTIONS, type AssetMix } from '../constants'
import { FieldLabel } from './FieldLabel'
import { SegmentedControl } from './SegmentedControl'

interface AssetMixPickerProps {
  value: AssetMix
  onChange: (mix: AssetMix) => void
}

export function AssetMixPicker({ value, onChange }: AssetMixPickerProps): React.JSX.Element {
  return (
    <div>
      <FieldLabel id="asset-mix-label">Asset Mix</FieldLabel>
      <SegmentedControl
        value={value}
        onValueChange={onChange}
        options={MIX_OPTIONS}
        ariaLabel="Asset Mix"
        className="h-12"
        itemClassName="h-full"
      />
    </div>
  )
}
