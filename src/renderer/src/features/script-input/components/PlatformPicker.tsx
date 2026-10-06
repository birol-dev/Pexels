import React from 'react'
import {
  ReelsIcon,
  ShortsIcon,
  TikTokIcon,
  YouTubeIcon
} from '@renderer/components/icons/platform-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { PLATFORM_OPTIONS, type PlatformType } from '../constants'
import { FieldLabel } from './FieldLabel'

const PLATFORM_ICONS: Record<PlatformType, () => React.JSX.Element> = {
  YouTube: () => <YouTubeIcon />,
  Shorts: () => <ShortsIcon />,
  TikTok: () => <TikTokIcon />,
  'Instagram Reels': () => <ReelsIcon />
}

interface PlatformPickerProps {
  value: PlatformType
  onChange: (platform: PlatformType) => void
}

export function PlatformPicker({ value, onChange }: PlatformPickerProps): React.JSX.Element {
  return (
    <div>
      <FieldLabel htmlFor="platform-layout">Platform Layout</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as PlatformType)}>
        <SelectTrigger id="platform-layout" className="h-12 w-full px-4">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLATFORM_OPTIONS.map((item) => {
            const PlatformIcon = PLATFORM_ICONS[item.value]
            return (
              <SelectItem key={item.value} value={item.value}>
                <span className="flex items-center gap-2.5">
                  <PlatformIcon />
                  <span>{item.label}</span>
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
