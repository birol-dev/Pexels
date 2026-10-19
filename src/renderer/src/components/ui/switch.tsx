import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { Switch as SwitchPrimitive } from 'radix-ui'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border-0 transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-5 data-[size=sm]:w-9 data-[state=checked]:bg-primary-container data-[state=unchecked]:bg-control',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none m-0.5 block rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.2)] ring-0 transition-transform group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4 data-[state=checked]:translate-x-full data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
