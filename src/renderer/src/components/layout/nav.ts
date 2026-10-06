import {
  ChartLineUpIcon,
  FolderStarIcon,
  GearSixIcon,
  ImagesIcon,
  PlusSquareIcon,
  type Icon
} from '@phosphor-icons/react'
import type { TabItem } from '@renderer/lib/store'

export type AppRoute = TabItem['type']

export const NAV_ITEMS: { route: AppRoute; label: string; icon: Icon }[] = [
  { route: 'input', label: 'Create Pack', icon: PlusSquareIcon },
  { route: 'run', label: 'Run Progress', icon: ChartLineUpIcon },
  { route: 'stuff', label: 'Media Library', icon: FolderStarIcon },
  { route: 'settings', label: 'Settings', icon: GearSixIcon }
]

export const TAB_ICONS: Record<AppRoute, Icon> = {
  input: PlusSquareIcon,
  run: ChartLineUpIcon,
  stuff: ImagesIcon,
  settings: GearSixIcon
}
