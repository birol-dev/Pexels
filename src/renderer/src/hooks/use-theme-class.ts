import { useEffect } from 'react'

type Theme = 'flat-black' | 'flat-white' | undefined

/**
 * Applies the theme on <html> (not a wrapper div) so portaled Radix content
 * (dialogs, selects, tooltips, toasts) inherits the same theme variables.
 */
export function useThemeClass(theme: Theme): void {
  useEffect(() => {
    const root = document.documentElement
    const light = theme === 'flat-white'
    root.classList.toggle('theme-flat-white', light)
    root.classList.toggle('theme-flat-black', !light)
    root.classList.toggle('dark', !light)
  }, [theme])
}
