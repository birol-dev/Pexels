import {
  ArrowsClockwiseIcon,
  CpuIcon,
  FlaskIcon,
  FolderIcon,
  GaugeIcon,
  ImagesIcon,
  PaletteIcon,
  ShieldCheckIcon,
  WrenchIcon,
  type Icon
} from '@phosphor-icons/react'

/** The Settings menu, in page order. Each panel renders its section with the matching id. */
export const SETTINGS_SECTIONS = [
  { id: 'settings-ai', label: 'AI provider', icon: CpuIcon },
  { id: 'settings-pexels', label: 'Pexels', icon: ImagesIcon },
  { id: 'settings-storage', label: 'Storage', icon: FolderIcon },
  { id: 'settings-appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'settings-safety', label: 'Safety', icon: ShieldCheckIcon },
  { id: 'settings-performance', label: 'Performance', icon: GaugeIcon },
  { id: 'settings-experimental', label: 'Experimental', icon: FlaskIcon },
  { id: 'settings-updates', label: 'Updates', icon: ArrowsClockwiseIcon },
  { id: 'settings-advanced', label: 'Advanced', icon: WrenchIcon }
] as const satisfies readonly { id: string; label: string; icon: Icon }[]

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']
