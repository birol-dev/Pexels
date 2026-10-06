import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerGapIcon,
  WarningIcon,
  XCircleIcon
} from '@phosphor-icons/react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useAppStore } from '@renderer/lib/store'

const Toaster = ({ ...props }: ToasterProps): React.JSX.Element => {
  const theme = useAppStore((s) => s.settings?.theme)

  return (
    <Sonner
      theme={theme === 'flat-white' ? 'light' : 'dark'}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" weight="fill" />,
        info: <InfoIcon className="size-4" weight="fill" />,
        warning: <WarningIcon className="size-4" weight="fill" />,
        error: <XCircleIcon className="size-4" weight="fill" />,
        loading: <SpinnerGapIcon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)'
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
