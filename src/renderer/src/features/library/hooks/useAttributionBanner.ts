import { useState } from 'react'
import { ATTRIBUTION_BANNER_KEY } from '../utils'

export function useAttributionBanner(): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(
    () => localStorage.getItem(ATTRIBUTION_BANNER_KEY) !== 'true'
  )

  const dismiss = (): void => {
    localStorage.setItem(ATTRIBUTION_BANNER_KEY, 'true')
    setVisible(false)
  }

  return { visible, dismiss }
}
