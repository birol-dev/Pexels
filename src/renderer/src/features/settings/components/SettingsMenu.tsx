import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../sections'

/**
 * The section list: a sticky column beside the form on wide windows, a scrolling row of pills
 * above it on narrow ones. The section nearest the top of the view is marked current.
 */
export function SettingsMenu(): React.JSX.Element {
  const [current, setCurrent] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id)

  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = SETTINGS_SECTIONS.find((section) => visible.has(section.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: '0px 0px -65% 0px' }
    )
    for (const section of SETTINGS_SECTIONS) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const go = (id: SettingsSectionId): void => {
    setCurrent(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label="Settings sections"
      className="scrollbar-none -mx-grid-margin flex gap-1 overflow-x-auto px-grid-margin lg:sticky lg:top-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
    >
      {SETTINGS_SECTIONS.map(({ id, label, icon: SectionIcon }) => {
        const active = current === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-full px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none lg:rounded-xl',
              active
                ? 'bg-surface-container font-medium text-on-surface'
                : 'text-outline hover:bg-surface-container/60 hover:text-on-surface'
            )}
          >
            <SectionIcon size={18} weight={active ? 'fill' : 'regular'} className="shrink-0" />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
